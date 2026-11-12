// apps/control-api/src/routes/webhook.ts
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { decryptAesGcm } from '@zalo-baas/crypto';
import { ZaloBotClient } from '@zalo-baas/zalo-bot-sdk';
import { GeminiClient, buildSystemInstruction, formatContextBlock } from '@zalo-baas/llm';
import { filterMatches, type VectorMatch } from '@zalo-baas/rag';
import type { Env, HonoVariables } from '../types.js';

export const webhookRouter = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// Helper to normalize Vietnamese text (strip accents and special characters)
export function normalizeVietnamese(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface MenuItem {
  name: string;
  price: string;
  unit: string;
  note: string;
  raw?: string;
}

// Strip markdown formatting decorators from parsed labels
function stripMarkdownInline(text: string): string {
  return text.replace(/\*\*|__|`/g, '').trim();
}

// Parses pricing/menu items from markdown tables, bullet lists, headings + price lines
export function parseMenuItems(content: string): MenuItem[] {
  const items: MenuItem[] = [];
  const lines = content.split('\n');
  let currentHeading = '';

  const genericPriceLabels = new Set([
    'giá', 'gia', 'giá bán', 'gia ban', 'đơn giá', 'don gia', 'cước phí', 'cuoc phi', 'chi phí', 'chi phi', 'phí', 'phi', 'học phí',
  ]);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Track current Markdown or numbered heading so multi-line specs (e.g. "### Gói Starter\n- Giá: 99.000đ/tháng") preserve item name
    const headingMatch = trimmed.match(/^(?:#{1,6}\s+|(?:\d+[.)]\s+))(.+)$/);
    if (headingMatch && !trimmed.includes(':') && !/\d{1,3}(?:[.,]\d{3})+\s*(?:đ|vnd|vnđ)/i.test(trimmed)) {
      currentHeading = stripMarkdownInline(headingMatch[1]);
      continue;
    }

    // 1. Markdown table row: | Tên món/Gói | Giá | Đơn vị | Ghi chú |
    if (trimmed.startsWith('|') && !trimmed.includes('|:--') && !trimmed.includes('|---')) {
      const parts = trimmed.split('|').map((p) => stripMarkdownInline(p)).filter(Boolean);
      if (parts.length >= 2) {
        const name = parts[0];
        const price = parts[1];
        const unit = parts[2] || '';
        const note = parts.slice(3).join(' · ');
        const nameLower = name.toLowerCase();
        const isHeaderRow = nameLower === 'tên món' || nameLower === 'gói cước' || nameLower === 'dịch vụ' || nameLower === 'sản phẩm';
        if (!isHeaderRow && /\d+/.test(price)) {
          items.push({ name, price, unit: unit || 'gói/phần', note, raw: trimmed });
          continue;
        }
      }
    }

    // 2. Bullet / List format: - **Gói Starter**: 99.000 đ / tháng (Ghi chú)
    const cleanLine = stripMarkdownInline(trimmed);
    const listMatch = cleanLine.match(
      /^[-*•\d.]+\s*(.+?)\s*[:–-]\s*([\d.,]+\s*(?:đ|vnd|vnđ|k|nghìn|đồng|0\.?đ|miễn phí)?)\s*(?:\/\s*([^\s()]+))?\s*(?:\((.*?)\))?$/i
    );
    if (listMatch && /\d/.test(listMatch[2])) {
      let itemName = listMatch[1].trim();
      const normLabel = itemName.toLowerCase();
      if (genericPriceLabels.has(normLabel) && currentHeading) {
        itemName = currentHeading;
      }
      if (!normLabel.includes('giờ mở') && !normLabel.includes('hotline') && !normLabel.includes('điện thoại')) {
        items.push({
          name: itemName,
          price: listMatch[2].trim(),
          unit: listMatch[3] ? listMatch[3].trim() : 'gói/phần',
          note: listMatch[4] ? listMatch[4].trim() : '',
          raw: trimmed,
        });
        continue;
      }
    }

    // 3. General line containing explicit VND price: e.g. Gói Starter 99.000đ / tháng
    const priceMatch = cleanLine.match(
      /([^\d:–-]+?)\s*[:–-]?\s*(\d{1,3}(?:[.,]\d{3})+\s*(?:đ|vnd|vnđ|đồng)|\d+\s*(?:k|nghìn|triệu)\b)\s*(?:\/\s*([^\s()]+))?\s*(?:\((.*?)\))?/i
    );
    if (
      priceMatch &&
      priceMatch[1].trim().length >= 2 &&
      !priceMatch[1].toLowerCase().includes('giờ mở') &&
      !priceMatch[1].toLowerCase().includes('hotline') &&
      !priceMatch[1].toLowerCase().includes('điện thoại')
    ) {
      let itemName = priceMatch[1].replace(/^[-*•\d.]+\s*/, '').trim();
      if (genericPriceLabels.has(itemName.toLowerCase()) && currentHeading) {
        itemName = currentHeading;
      }
      items.push({
        name: itemName,
        price: priceMatch[2].trim(),
        unit: priceMatch[3] ? priceMatch[3].trim() : 'gói/phần',
        note: priceMatch[4] ? priceMatch[4].trim() : '',
        raw: trimmed,
      });
    }
  }

  return items;
}

// Extracts key search terms by removing punctuation and stop words
export function extractSearchTerms(query: string) {
  const clean = query
    .toLowerCase()
    .replace(/[?!.,;:()"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const stopWords = new Set([
    'giá', 'gia', 'bao', 'nhiêu', 'nhieu', 'tiền', 'tien', 'của', 'cua', 'cửa', 'hàng', 'hang',
    'quán', 'quan', 'cho', 'hỏi', 'hoi', 'có', 'co', 'bán', 'ban', 'không', 'khong', 'mình', 'minh',
    'em', 'ơi', 'oi', 'ạ', 'a', 'nhỉ', 'nhi', 'shop', 'với', 'voi', 'ở', 'o', 'đâu', 'dau',
    'là', 'la', 'mấy', 'may', 'thế', 'the', 'nào', 'nao', 'như', 'nhu', 'được', 'duoc', 'giới', 'thiệu',
    'giới thiệu', 'về', 've', 'tôi', 'toi', 'bạn', 'ban', 'hệ', 'thống', 'gì', 'gi', 'chi', 'tiết',
    'cây', 'que', 'xiên', 'xien', 'phần', 'phan', 'miếng', 'mieng', 'cái', 'cai', 'hộp', 'hop', 'ly', 'cốc', 'coc',
    'bên', 'ben', 'thì', 'thi', 'loại', 'loai', 'các', 'cac', 'những', 'nhung', 'một', 'mot', 'từng', 'tung', 'xem'
  ]);

  const words = clean.split(' ').filter((w) => w.length > 0 && !stopWords.has(w));
  return {
    rawClean: clean,
    words,
    phrase: words.join(' '),
    normWords: words.map((w) => normalizeVietnamese(w)),
    normPhrase: normalizeVietnamese(words.join(' ')),
  };
}

// Searches menu items using exact phrase, normalized phrase, and word matching
export function searchMenuItems(query: string, items: MenuItem[]): MenuItem[] {
  const kw = extractSearchTerms(query);
  if (!kw.phrase && kw.words.length === 0) {
    return items;
  }

  const results: Array<{ item: MenuItem; score: number }> = [];

  for (const item of items) {
    const rawName = item.name.toLowerCase();
    const rawNote = (item.note || '').toLowerCase();
    const normName = normalizeVietnamese(item.name);
    const normNote = normalizeVietnamese(item.note || '');

    let score = 0;

    // 1. Exact phrase match (with or without tone)
    if (kw.phrase && (rawName.includes(kw.phrase) || rawNote.includes(kw.phrase))) {
      score += 100;
    }
    if (kw.normPhrase && (normName.includes(kw.normPhrase) || normNote.includes(kw.normPhrase))) {
      score += 80;
    }

    // 2. Word matches
    let matchedWordsCount = 0;
    for (let i = 0; i < kw.words.length; i++) {
      const w = kw.words[i];
      const nw = kw.normWords[i];

      const regexRaw = new RegExp('(?:^|\\s)' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|\\s)', 'i');
      const regexNorm = new RegExp('(?:^|\\s)' + nw + '(?:$|\\s)', 'i');

      if (regexRaw.test(rawName)) {
        score += 30;
        matchedWordsCount++;
      } else if (rawName.includes(w)) {
        score += 20;
        matchedWordsCount++;
      } else if (regexNorm.test(normName)) {
        score += 25;
        matchedWordsCount++;
      } else if (normName.includes(nw)) {
        score += 15;
        matchedWordsCount++;
      }
    }

    if (matchedWordsCount > 0 || score >= 50) {
      results.push({ item, score: score + matchedWordsCount * 10 });
    }
  }

  results.sort((a, b) => b.score - a.score);

  if (results.length > 0) {
    const topScore = results[0].score;
    const threshold = topScore >= 60 ? topScore * 0.4 : 10;
    return results.filter((r) => r.score >= threshold).map((r) => r.item);
  }

  return [];
}

// Searches knowledge base sections (markdown headings & paragraphs) for non-menu / general queries
function searchKnowledgeSections(query: string, sanitizedContent: string): string[] {
  const kw = extractSearchTerms(query);
  // Keep meaningful query words including "giới thiệu", "tính năng", "gói"
  const rawTokens = query
    .toLowerCase()
    .replace(/[?!.,;:()"'`]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const searchTokens = Array.from(new Set([...kw.words, ...rawTokens])).filter((w) => w.length > 1);
  if (searchTokens.length === 0) return [];

  // Split content into sections by markdown headings or numbered headers
  const lines = sanitizedContent.split('\n');
  const sections: Array<{ heading: string; body: string }> = [];
  let currentHeading = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading =
      /^#{1,6}\s+/.test(trimmed) ||
      /^\d+\.\s+[A-ZÀ-Ỹa-zà-ỹ]/.test(trimmed) ||
      (/^[A-ZÀ-Ỹ0-9\s,&\-–/:()]{6,}$/.test(trimmed) && !trimmed.startsWith('|'));

    if (isHeading && currentLines.length > 0) {
      sections.push({ heading: currentHeading, body: currentLines.join('\n').trim() });
      currentHeading = trimmed;
      currentLines = [line];
    } else {
      if (isHeading && !currentHeading) currentHeading = trimmed;
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    sections.push({ heading: currentHeading, body: currentLines.join('\n').trim() });
  }

  const scored = sections
    .filter((sec) => sec.body.length > 0)
    .map((sec) => {
      const lowerBody = sec.body.toLowerCase();
      const normBody = normalizeVietnamese(sec.body);
      const lowerHeading = sec.heading.toLowerCase();
      const normHeading = normalizeVietnamese(sec.heading);
      let score = 0;

      if (kw.phrase && lowerBody.includes(kw.phrase)) score += 35;
      if (kw.normPhrase && normBody.includes(kw.normPhrase)) score += 25;
      if (kw.phrase && lowerHeading.includes(kw.phrase)) score += 45;
      if (kw.normPhrase && normHeading.includes(kw.normPhrase)) score += 35;

      for (const token of searchTokens) {
        const nt = normalizeVietnamese(token);
        if (lowerHeading.includes(token) || (nt && normHeading.includes(nt))) score += 15;
        else if (lowerBody.includes(token) || (nt && normBody.includes(nt))) score += 5;
      }

      return { body: sec.body, score };
    })
    .filter((s) => s.score >= 10)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 3).map((s) => s.body);
}

// Helper to extract dynamically any contact/hotline/email line actually present in bot's docs
function extractContactSnippet(rawContent: string): string {
  const lines = rawContent.split('\n');
  const matches: string[] = [];
  for (const l of lines) {
    const low = l.toLowerCase();
    if (
      low.includes('hotline') ||
      low.includes('liên hệ') ||
      low.includes('số điện thoại') ||
      low.includes('zalo quản lý') ||
      low.includes('email:') ||
      /0\d{2,3}[.\s-]?\d{3}[.\s-]?\d{3,4}/.test(l)
    ) {
      const cleaned = l.replace(/^[\s*•\-–]+/, '').trim();
      if (cleaned && !matches.includes(cleaned)) matches.push(cleaned);
    }
  }
  return matches.slice(0, 2).join('\n• ');
}

// Helper to extract clean customer-facing information or answer specific queries without cross-tenant/cross-bot hardcoding
export function formatSmartKnowledgeReply(
  query: string,
  rawContent: string,
  botName: string,
  displayName: string
): string {
  const queryLower = query.toLowerCase();
  const sanitizedContent = sanitizeCustomerFacingContent(rawContent);

  // 1. Check if user is asking about Operating Hours (only if present in this bot's docs)
  if (
    queryLower.includes('giờ mở') ||
    queryLower.includes('mở cửa') ||
    queryLower.includes('đóng cửa') ||
    queryLower.includes('mấy giờ') ||
    queryLower.includes('thời gian mở') ||
    queryLower.includes('giờ làm việc') ||
    queryLower.includes('hoạt động lúc')
  ) {
    const lines = sanitizedContent.split('\n');
    let hoursLine = '';
    for (const l of lines) {
      const low = l.toLowerCase();
      if (
        low.includes('giờ mở cửa') ||
        low.includes('giờ làm việc') ||
        low.includes('thời gian hoạt động') ||
        /\d{1,2}[:h]\d{2}\s*[–-]\s*\d{1,2}[:h]\d{2}/.test(low)
      ) {
        hoursLine = l.replace(/^[\s*•\-–]+/, '').trim();
        break;
      }
    }

    if (hoursLine) {
      return `Xin chào ${displayName}! Em là ${botName}.\n\n⏰ **Thời gian hoạt động:**\n• ${hoursLine}\n\nRất hân hạnh được phục vụ ${displayName} ạ!`;
    }
  }

  // 2. Check if user is asking about Address / Location (only if present in this bot's docs)
  if (
    queryLower.includes('địa chỉ') ||
    queryLower.includes('ở đâu') ||
    queryLower.includes('vị trí') ||
    queryLower.includes('trụ sở') ||
    queryLower.includes('chỉ đường') ||
    queryLower.includes('bản đồ') ||
    queryLower.includes('maps') ||
    queryLower.includes('google maps')
  ) {
    const lines = sanitizedContent.split('\n');
    let addressLine = '';
    let mapsLine = '';

    for (const l of lines) {
      const low = l.toLowerCase();
      if (low.includes('địa chỉ') || low.includes('trụ sở')) {
        addressLine = l.replace(/^[\s*•\-–]+/, '').trim();
      } else if (low.includes('bản đồ') || low.includes('maps.app.goo.gl') || low.includes('google maps')) {
        mapsLine = l.replace(/^[\s*•\-–]+/, '').trim();
      }
    }

    if (addressLine || mapsLine) {
      let reply = `Xin chào ${displayName}! Em là ${botName}.`;
      if (addressLine) {
        reply += `\n\n📍 **Địa chỉ liên hệ:**\n• ${addressLine}`;
      }
      if (mapsLine) {
        reply += `\n🗺️ **Chỉ đường (Google Maps):**\n• ${mapsLine}`;
      }
      reply += `\n\nRất hân hạnh được đón tiếp và hỗ trợ ${displayName} ạ!`;
      return reply;
    }
  }

  // 3. Check if user is asking about Hotline / Contact (dynamically extracted)
  if (
    queryLower.includes('hotline') ||
    queryLower.includes('số điện thoại') ||
    queryLower.includes('sđt') ||
    queryLower.includes('điện thoại') ||
    queryLower.includes('quản lý') ||
    queryLower.includes('liên hệ')
  ) {
    const contactSnippet = extractContactSnippet(sanitizedContent);
    if (contactSnippet) {
      return `Xin chào ${displayName}! Em là ${botName}.\n\n📞 **Thông tin liên hệ hỗ trợ:**\n• ${contactSnippet}\n\nBạn có thể liên hệ theo thông tin trên để được hỗ trợ nhanh nhất nhé!`;
    }
  }

  // 4. Check if user is asking about Online Delivery / Registration channels (only if mentioned in this bot's docs)
  if (
    queryLower.includes('giao hàng') ||
    queryLower.includes('đặt hàng') ||
    queryLower.includes('ship') ||
    queryLower.includes('giao tận nơi') ||
    queryLower.includes('shopeefood') ||
    queryLower.includes('grabfood') ||
    queryLower.includes('villfood') ||
    queryLower.includes('app')
  ) {
    const deliveryLines = sanitizedContent
      .split('\n')
      .filter((l) => /giao hàng|đặt hàng|ship|shopeefood|grabfood|villfood|hotline/i.test(l))
      .map((l) => `• ${l.replace(/^[\s*•\-–]+/, '').trim()}`);

    if (deliveryLines.length > 0) {
      return `Xin chào ${displayName}! Em là ${botName}.\n\n🛵 **Thông tin đặt hàng & giao nhận:**\n${deliveryLines.join('\n')}`;
    }
  }

  // 5. Check if user is asking for the entire catalog / menu / package list
  const isFullMenu = /\b(menu|thực đơn|toàn bộ|tất cả|danh sách món|các món|bảng giá tổng|tất cả gói|full)\b/i.test(queryLower);

  // 6. Intelligent fuzzy & keyword item/pricing search
  const allItems = parseMenuItems(sanitizedContent);

  if (!isFullMenu) {
    const matchedItems = searchMenuItems(query, allItems);

    if (matchedItems.length > 0) {
      const searchTerms = extractSearchTerms(query);
      const titleKeyword = searchTerms.phrase ? searchTerms.phrase.toUpperCase() : 'SẢN PHẨM / DỊCH VỤ';

      const itemsList = matchedItems
        .map((r) => {
          let emoji = '•';
          const nLow = r.name.toLowerCase();
          if (nLow.includes('gà')) emoji = '🍗';
          else if (nLow.includes('xúc xích') || nLow.includes('hotdog')) emoji = '🌭';
          else if (nLow.includes('khoai')) emoji = '🍟';
          else if (nLow.includes('mì') || nLow.includes('spaghetti')) emoji = '🍝';
          else if (nLow.includes('nước') || nLow.includes('trà') || nLow.includes('pepsi') || nLow.includes('coca')) emoji = '🥤';
          else if (nLow.includes('viên') || nLow.includes('que') || nLow.includes('xiên')) emoji = '🍢';
          else if (nLow.includes('gói') || nLow.includes('starter') || nLow.includes('pro') || nLow.includes('enterprise') || nLow.includes('trial')) emoji = '📦';

          const unitPart = r.unit ? ` / ${r.unit}` : '';
          return `${emoji === '•' ? '•' : `• ${emoji}`} **${r.name}**: ${r.price}${unitPart}${r.note ? ` _(${r.note})_` : ''}`;
        })
        .join('\n');

      // Check if bot's own docs have any companion/upsell lines instead of hardcoding external items
      const docUpsellLine = sanitizedContent
        .split('\n')
        .find((l) => /gợi ý thêm|ăn kèm|ưu đãi|khuyến mãi/i.test(l));
      const upsellFooter = docUpsellLine
        ? `\n\n✨ **Gợi ý thêm:** ${docUpsellLine.replace(/^[\s*•\-–]+/, '').trim()}`
        : '';

      return `Xin chào ${displayName}! Em là ${botName}.\n\nDạ em xin gửi ${displayName} thông tin chi tiết về **${titleKeyword}** ạ:\n\n${itemsList}${upsellFooter}`;
    }

    // 6.1 Search markdown headings & knowledge sections (handles e.g. "giới thiệu tính năng?", "cách sử dụng?", "chính sách?")
    const matchedSections = searchKnowledgeSections(query, sanitizedContent);
    if (matchedSections.length > 0) {
      return `Xin chào ${displayName}! Em là ${botName}.\n\nDạ em xin gửi ${displayName} thông tin từ tài liệu của **${botName}** ạ:\n\n${matchedSections.join('\n\n')}`;
    }

    // 6.2 If user explicitly asks for price/product/package and nothing matched at all
    if (
      queryLower.includes('giá') ||
      queryLower.includes('bao nhiêu') ||
      queryLower.includes('tiền') ||
      queryLower.includes('gói') ||
      queryLower.includes('món') ||
      queryLower.includes('sản phẩm')
    ) {
      const searchTerms = extractSearchTerms(query);
      const missingTerm = searchTerms.phrase || query.replace(/[?!.,]/g, '').trim();
      const contactSnippet = extractContactSnippet(sanitizedContent);
      const contactFooter = contactSnippet
        ? `\n\n📞 **Thông tin hỗ trợ:**\n• ${contactSnippet}`
        : '';
      return `Xin chào ${displayName}! Em là ${botName}.\n\nDạ hiện tại trong tài liệu của **${botName}** em chưa tìm thấy thông tin về "${missingTerm}".\n\n👉 Bạn vui lòng nhập từ khóa cụ thể hơn hoặc nhắn **"bảng giá"** / tên tính năng để em tra cứu chính xác nhất nhé!${contactFooter}`;
    }
  }

  // 7. Full menu / full knowledge fallback (completely bound to this bot's sanitizedContent)
  if (isFullMenu && /\b(menu|thực đơn|danh sách món|các món)\b/i.test(queryLower)) {
    const deliveryLines = sanitizedContent
      .split('\n')
      .filter((l) => /giao hàng|đặt hàng|shopeefood|grabfood|villfood/i.test(l))
      .map((l) => l.replace(/^[\s*•\-–]+/, '').trim());
    const deliveryNote = deliveryLines.length > 0 ? `\n\n🛵 **Kênh đặt hàng:** ${deliveryLines.join(' | ')}` : '';
    return `Xin chào ${displayName}! Em là ${botName}.\n\nDạ em xin gửi bạn **Thực đơn đầy đủ** hiện có ạ:\n\n${sanitizedContent}${deliveryNote}`;
  }

  // General clean fallback
  return `Xin chào ${displayName}! Em là ${botName}.\n\nDạ em xin gửi bạn thông tin chi tiết ạ:\n\n${sanitizedContent}`;
}

// Strip internal administrative sections that must never be shown to customers
function sanitizeCustomerFacingContent(content: string): string {
  const lines = content.split('\n');
  const cleanLines: string[] = [];
  let skippingInternalSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    // Check if this line starts an internal section
    if (
      lower.includes('định vị thương hiệu') ||
      lower.includes('phong cách giao tiếp') ||
      lower.includes('giọng điệu của bot') ||
      lower.includes('khi xử lý khiếu nại') ||
      lower.includes('quy tắc vận hành') ||
      lower.includes('khách hàng mục tiêu')
    ) {
      skippingInternalSection = true;
      continue;
    }

    // Check if we reached a customer-facing section like "THỰC ĐƠN", "BẢNG GIÁ", "THÔNG TIN CỬA HÀNG"
    if (
      lower.includes('thực đơn') ||
      lower.includes('bảng giá') ||
      lower.includes('thông tin cửa hàng') ||
      trimmed.startsWith('|')
    ) {
      skippingInternalSection = false;
    }

    if (!skippingInternalSection) {
      // Also filter out single prompt-like lines
      if (
        !lower.includes('kho tri thức & quy tắc') &&
        !lower.includes('chuyển ngay sang thái độ nghiêm túc') &&
        !lower.includes('tuyệt đối không tranh cãi') &&
        !lower.includes('giọng điệu của bot')
      ) {
        cleanLines.push(line);
      }
    }
  }

  const result = cleanLines.join('\n').trim();
  return result || content.trim();
}

// Inbound webhook for Zalo Bot Platform
webhookRouter.post('/bot/:botId', async (c) => {
  const botId = c.req.param('botId');
  const now = Date.now();

  // 1. Fetch bot and verify status (with rag_scope isolation setting)
  type WebhookBotRow = {
    id: string;
    tenant_id: string;
    name: string;
    status: string;
    system_prompt: string | null;
    strict_grounding: number;
    rag_scope?: string | null;
    handover_keywords: string | null;
    handover_minutes: number;
  };
  let bot: WebhookBotRow | null = null;
  try {
    bot = await c.env.DB.prepare(
      `SELECT id, tenant_id, name, status, system_prompt, strict_grounding, COALESCE(rag_scope, 'bot_and_global') as rag_scope, handover_keywords, handover_minutes
       FROM bots WHERE id = ?`
    )
      .bind(botId)
      .first<WebhookBotRow>();
  } catch {
    bot = await c.env.DB.prepare(
      `SELECT id, tenant_id, name, status, system_prompt, strict_grounding, handover_keywords, handover_minutes
       FROM bots WHERE id = ?`
    )
      .bind(botId)
      .first<WebhookBotRow>();
  }

  if (!bot || bot.status !== 'active') {
    return c.json({ ok: false, error: 'Bot not found or not active' }, 404);
  }

  // 2. Fetch encrypted bot credentials
  const cred = await c.env.DB.prepare(
    'SELECT bot_token_enc, secret_token_enc FROM bot_credentials WHERE bot_id = ?'
  )
    .bind(botId)
    .first<{ bot_token_enc: Uint8Array | ArrayBuffer; secret_token_enc: Uint8Array | ArrayBuffer }>();

  if (!cred) {
    return c.json({ ok: false, error: 'Bot credentials missing' }, 404);
  }

  // 3. Decrypt bot token
  const tokenBytes = cred.bot_token_enc instanceof Uint8Array ? cred.bot_token_enc : new Uint8Array(cred.bot_token_enc);
  const botToken = await decryptAesGcm(tokenBytes, c.env.KEK_V1);
  const zaloClient = new ZaloBotClient(botToken);

  // 4. Parse incoming JSON body flexibly
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ ok: true, ignored: true, reason: 'invalid_json' });
  }

  const rawMsg = (body.message || body) as Record<string, unknown>;
  const rawText = rawMsg.text || body.text || '';
  const safeText = String(rawText).trim();

  // Extract identifiers flexibly
  const rawChat = (rawMsg.chat || body.chat || {}) as Record<string, unknown>;
  const rawFrom = (rawMsg.from || body.from || body.sender || {}) as Record<string, unknown>;

  const chatId = String(rawChat.id || rawFrom.id || '');
  const userId = String(rawFrom.id || chatId || 'user_anon');
  const displayName = String(rawFrom.display_name || rawFrom.name || 'Người dùng Zalo');
  const messageId = String(rawMsg.message_id || body.message_id || `msg_${now}`);

  if (!chatId) {
    // If event has no chat ID (e.g. system heartbeat), acknowledge with 200
    return c.json({ ok: true, acknowledged: true });
  }

  // 5. Send typing action immediately to keep user engaged
  try {
    await zaloClient.sendChatAction({ chat_id: chatId, action: 'typing' });
  } catch (err) {
    console.warn('[Webhook] sendChatAction warning:', err);
  }

  // 6. Upsert conversation
  const convId = `conv_${nanoid(16)}`;
  await c.env.DB.prepare(
    `INSERT INTO conversations (id, tenant_id, bot_id, chat_id, display_name, last_message_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(bot_id, chat_id) DO UPDATE SET
       last_message_at = excluded.last_message_at,
       display_name = excluded.display_name`
  )
    .bind(convId, bot.tenant_id, bot.id, chatId, displayName, now)
    .run();

  const convRow = await c.env.DB.prepare(
    'SELECT id, state, human_until FROM conversations WHERE bot_id = ? AND chat_id = ?'
  )
    .bind(bot.id, chatId)
    .first<{ id: string; state: string; human_until: number | null }>();

  const activeConvId = convRow?.id ?? convId;
  const isHumanState = convRow?.state === 'human' && (convRow.human_until ?? 0) > now;

  // 7. Save user message to DB
  await c.env.DB.prepare(
    `INSERT INTO messages (id, tenant_id, conversation_id, direction, sender, text, zalo_msg_id, created_at)
     VALUES (?, ?, ?, 'in', 'user', ?, ?, ?)`
  )
    .bind(`msg_${nanoid(16)}`, bot.tenant_id, activeConvId, safeText, messageId, now)
    .run();

  // 8. If in human handover mode, do not auto-respond
  if (isHumanState) {
    return c.json({ ok: true, mode: 'human' });
  }

  // 9. Check handover keywords
  const DEFAULT_HANDOVER_KEYWORDS = ['gặp nhân viên', 'tư vấn viên', 'người thật', 'khiếu nại', 'cskh', 'hỗ trợ viên'];
  let wantsHandover = false;
  const lowerText = safeText.toLowerCase();
  for (const kw of DEFAULT_HANDOVER_KEYWORDS) {
    if (lowerText.includes(kw)) {
      wantsHandover = true;
      break;
    }
  }

  if (!wantsHandover && bot.handover_keywords) {
    try {
      const customKws = JSON.parse(bot.handover_keywords);
      if (Array.isArray(customKws)) {
        for (const kw of customKws) {
          if (kw && lowerText.includes(String(kw).toLowerCase().trim())) {
            wantsHandover = true;
            break;
          }
        }
      }
    } catch {}
  }

  if (wantsHandover) {
    const handoverMinutes = bot.handover_minutes || 30;
    const humanUntil = now + handoverMinutes * 60 * 1000;
    await c.env.DB.prepare('UPDATE conversations SET state = ?, human_until = ? WHERE id = ?')
      .bind('human', humanUntil, activeConvId)
      .run();
    await c.env.DB.prepare('INSERT INTO handovers (id, tenant_id, conversation_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(`ho_${nanoid(16)}`, bot.tenant_id, activeConvId, 'keyword', 'open', now)
      .run();

    const handoverReply = 'Dạ em đã ghi nhận yêu cầu và chuyển tiếp tới nhân viên tư vấn. Nhân viên sẽ phản hồi bạn trong ít phút nữa ạ!';
    const sent = await zaloClient.sendMessage({ chat_id: chatId, text: handoverReply });
    await c.env.DB.prepare('INSERT INTO messages (id, tenant_id, conversation_id, direction, sender, text, zalo_msg_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(`msg_${nanoid(16)}`, bot.tenant_id, activeConvId, 'out', 'agent', handoverReply, sent.message_id, now)
      .run();

    return c.json({ ok: true, handover: true });
  }

  // 10. Generate AI & Knowledge Response
  let botReply = '';

  // 10.1 Resolve active Gemini API key (Tenant custom key prioritized over system env)
  let activeGeminiKey = c.env.GEMINI_API_KEY || '';
  try {
    const keyRow = await c.env.DB.prepare(
      'SELECT gemini_api_key FROM tenant_settings WHERE tenant_id = ?'
    )
      .bind(bot.tenant_id)
      .first<{ gemini_api_key: string }>();
    if (keyRow?.gemini_api_key && keyRow.gemini_api_key.trim()) {
      activeGeminiKey = keyRow.gemini_api_key.trim();
    }
  } catch {}

  // 10.2 Retrieve knowledge chunks directly from SQLite respecting per-bot rag_scope
  const ragScope = bot.rag_scope === 'bot_only' ? 'bot_only' : 'bot_and_global';
  let dbChunks: Array<{ id: string; bot_id: string | null; title: string; content: string }> = [];
  try {
    const scopeSql =
      ragScope === 'bot_only'
        ? `SELECT c.id, c.bot_id, c.content, d.title
           FROM chunks c
           JOIN documents d ON c.doc_id = d.id
           WHERE c.tenant_id = ?
             AND c.bot_id = ?
             AND d.status = 'ready'
           ORDER BY d.created_at DESC, c.ord ASC`
        : `SELECT c.id, c.bot_id, c.content, d.title
           FROM chunks c
           JOIN documents d ON c.doc_id = d.id
           WHERE c.tenant_id = ?
             AND (c.bot_id = ? OR c.bot_id IS NULL OR c.bot_id = '' OR c.bot_id = 'all')
             AND d.status = 'ready'
           ORDER BY CASE WHEN c.bot_id = ? THEN 0 ELSE 1 END, d.created_at DESC, c.ord ASC`;

    const stmt = c.env.DB.prepare(scopeSql);
    const chunkRows =
      ragScope === 'bot_only'
        ? await stmt.bind(bot.tenant_id, bot.id).all<{ id: string; bot_id: string | null; content: string; title: string }>()
        : await stmt.bind(bot.tenant_id, bot.id, bot.id).all<{ id: string; bot_id: string | null; content: string; title: string }>();

    if (chunkRows && Array.isArray(chunkRows.results)) {
      dbChunks = chunkRows.results.filter((r) => r.content && r.content.trim());
    }
  } catch (dbErr) {
    console.warn('[Webhook] SQLite chunks retrieval warning:', dbErr);
  }

  // 10.3 Knowledge selection strategy (prefer bot-dedicated chunks over global chunks)
  let relevantChunks: Array<{ title: string; content: string; score: number }> = [];

  if (dbChunks.length > 0 && dbChunks.length <= 20) {
    // For small-medium knowledge base (<= 20 chunks), pass ALL scoped chunks into context
    relevantChunks = dbChunks.map((c) => ({
      title: c.title || 'Tài liệu hướng dẫn',
      content: c.content,
      score: c.bot_id === bot.id ? 2.0 : 1.0,
    }));
  } else if (dbChunks.length > 20) {
    // For large knowledge base (> 20 chunks), perform hybrid semantic & keyword scoring
    let vectorMatches: Array<{ id: string; score: number }> = [];
    if (activeGeminiKey && c.env.VECTORS && safeText) {
      try {
        const geminiClient = new GeminiClient(activeGeminiKey);
        const embedResult = await geminiClient.embedContent({ text: safeText });
        const qRes = await c.env.VECTORS.query(embedResult.values, {
          topK: 12,
          filter: { tenant_id: bot.tenant_id },
          returnMetadata: 'all',
        });
        vectorMatches = (qRes.matches || [])
          .filter((m: any) => {
            const meta = m.metadata || {};
            if (meta.tenant_id && meta.tenant_id !== bot.tenant_id) return false;
            if (ragScope === 'bot_only') return meta.bot_id === bot.id;
            return !meta.bot_id || meta.bot_id === bot.id || meta.bot_id === 'all' || meta.bot_id === 'global';
          })
          .map((m: any) => ({
            id: m.id,
            score: m.score,
          }));
      } catch (vecErr) {
        console.warn('[Webhook] Vector query warning:', vecErr);
      }
    }

    const queryTokens = safeText.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    const scoredChunks = dbChunks.map((chunk) => {
      let score = chunk.bot_id === bot.id ? 5 : 0; // Prioritize bot-dedicated knowledge
      const contentLower = (chunk.title + ' ' + chunk.content).toLowerCase();
      for (const token of queryTokens) {
        if (contentLower.includes(token)) score += 1;
      }
      const vMatch = vectorMatches.find((vm) => vm.id === chunk.id);
      if (vMatch) score += vMatch.score * 5;
      return { ...chunk, score };
    });

    scoredChunks.sort((a, b) => b.score - a.score);
    relevantChunks = scoredChunks.slice(0, 10).map((c) => ({
      title: c.title,
      content: c.content,
      score: c.score,
    }));
  }

  // 10.4 Generate Response (Gemini AI or Smart Direct Knowledge Fallback)
  const isStrict = bot.strict_grounding === 1;

  if (activeGeminiKey && activeGeminiKey.trim()) {
    try {
      const geminiClient = new GeminiClient(activeGeminiKey);

      if (isStrict && dbChunks.length === 0) {
        botReply =
          'Dạ hiện tại em chưa tìm thấy thông tin phù hợp trong tài liệu hướng dẫn. Bạn có muốn kết nối với nhân viên tư vấn để được hỗ trợ chi tiết hơn không ạ?';
      } else {
        const contextBlock = formatContextBlock(relevantChunks);
        const systemInstruction = buildSystemInstruction({
          botName: bot.name,
          tenantSystemPrompt: bot.system_prompt || undefined,
          strictGrounding: isStrict,
        });
        const prompt = contextBlock ? `${contextBlock}\n\nCâu hỏi của khách hàng: ${safeText}` : safeText;
        const res = await geminiClient.generateContent({
          messages: [{ role: 'user', parts: [{ text: prompt }] }],
          systemInstruction,
        });
        botReply = res.text;
      }
    } catch (aiErr: any) {
      console.error('[Webhook] Gemini generation warning/error:', aiErr?.message, aiErr);

      // Intelligent Fallback: rank chunks by keyword relevance instead of picking chunk 0
      const queryLower = safeText.toLowerCase();
      const tokens = queryLower.split(/\s+/).filter((w) => w.length > 1);

      const candidateList = relevantChunks.length > 0 ? relevantChunks : dbChunks;
      let bestChunk = candidateList[0];
      let maxScore = -1;

      for (const chk of candidateList) {
        let score = 0;
        const textLower = (chk.title + ' ' + chk.content).toLowerCase();

        for (const t of tokens) {
          if (textLower.includes(t)) score += 2;
        }

        // Domain-agnostic semantic keyword boosting
        if ((queryLower.includes('giá') || queryLower.includes('bao nhiêu') || queryLower.includes('tiền') || queryLower.includes('gói')) &&
            (textLower.includes('bảng giá') || textLower.includes('vnđ') || textLower.includes('000đ') || textLower.includes('giá:') || textLower.includes('/tháng'))) {
          score += 10;
        }
        if ((queryLower.includes('thực đơn') || queryLower.includes('menu') || queryLower.includes('tính năng') || queryLower.includes('dịch vụ')) &&
            (textLower.includes('thực đơn') || textLower.includes('menu') || textLower.includes('tính năng') || textLower.includes('dịch vụ'))) {
          score += 10;
        }
        if ((queryLower.includes('địa chỉ') || queryLower.includes('ở đâu') || queryLower.includes('trụ sở')) &&
            (textLower.includes('địa chỉ') || textLower.includes('trụ sở') || textLower.includes('maps'))) {
          score += 10;
        }
        if ((queryLower.includes('giờ') || queryLower.includes('mở cửa') || queryLower.includes('làm việc')) &&
            (textLower.includes('giờ mở cửa') || textLower.includes('giờ làm việc') || textLower.includes('hoạt động'))) {
          score += 10;
        }

        if (score > maxScore) {
          maxScore = score;
          bestChunk = chk;
        }
      }

      const combinedKnowledge = (candidateList.length > 0 ? candidateList : dbChunks)
        .map((c) => c.content)
        .join('\n\n');

      if (combinedKnowledge || bestChunk) {
        botReply = formatSmartKnowledgeReply(
          safeText,
          combinedKnowledge || bestChunk.content,
          bot.name,
          displayName
        );
      } else {
        botReply = `Xin chào ${displayName}! Em đã nhận được tin nhắn của bạn. Em sẽ phản hồi bạn ngay ạ.`;
      }
    }
  } else {
    // If Gemini API Key is not set yet in Portal or Environment
    if (dbChunks.length > 0) {
      const combinedKnowledge = dbChunks.map((c) => c.content).join('\n\n');
      botReply = formatSmartKnowledgeReply(safeText, combinedKnowledge, bot.name, displayName);
    } else if (isStrict) {
      botReply = `Xin chào ${displayName}! Em là ${bot.name}. Hiện tại trong Kho Tri thức riêng của em chưa có tài liệu nào được nạp để tra cứu thông tin này ạ.`;
    } else {
      botReply = `Xin chào ${displayName}! Em là ${bot.name}. Em đã nhận được tin nhắn: "${safeText}". Hệ thống kết nối Zalo Bot đang hoạt động rất tốt!`;
    }
  }

  // 11. Send reply back to Zalo
  if (botReply) {
    try {
      const sent = await zaloClient.sendMessage({ chat_id: chatId, text: botReply });
      await c.env.DB.prepare(
        `INSERT INTO messages (id, tenant_id, conversation_id, direction, sender, text, zalo_msg_id, created_at)
         VALUES (?, ?, ?, 'out', 'ai', ?, ?, ?)`
      )
        .bind(`msg_${nanoid(16)}`, bot.tenant_id, activeConvId, botReply, sent.message_id, Date.now())
        .run();
    } catch (sendErr) {
      console.error('[Webhook] Failed to send message to Zalo:', sendErr);
    }
  }

  return c.json({ ok: true });
});
