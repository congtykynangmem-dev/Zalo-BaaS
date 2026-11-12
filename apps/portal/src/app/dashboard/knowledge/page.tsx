'use client';

import React, { useEffect, useState, useRef } from 'react';
import { fetchApi } from '@/lib/api';
import {
  BookOpen,
  Plus,
  Trash2,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Paperclip,
  UploadCloud,
  Globe,
  Bot,
  X,
  FileCode,
  FileSpreadsheet,
  Sparkles,
  Key,
  ExternalLink,
  Edit3,
} from 'lucide-react';

interface BotItem {
  id: string;
  name: string;
  username?: string;
}

interface DocItem {
  id: string;
  title: string;
  bot_id: string | null;
  bot_name?: string | null;
  size_bytes: number;
  status: 'ready' | 'processing' | 'failed';
  chunk_count: number;
  created_at: number;
}

export default function KnowledgePage() {
  const [bots, setBots] = useState<BotItem[]>([]);
  const [filterScope, setFilterScope] = useState<string>('all'); // 'all' | 'global' | botId
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [docsLoading, setDocsLoading] = useState(false);

  // Upload modal state
  const [showModal, setShowModal] = useState(false);
  const [scope, setScope] = useState<'all' | 'bot'>('bot');
  const [targetBotId, setTargetBotId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [attachedFileName, setAttachedFileName] = useState('');
  const [parsingFile, setParsingFile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editScope, setEditScope] = useState<'all' | 'bot'>('all');
  const [editTargetBotId, setEditTargetBotId] = useState<string>('');
  const [loadingEditContent, setLoadingEditContent] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // AI Configuration state
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiMaskedKey, setAiMaskedKey] = useState('');
  const [aiSource, setAiSource] = useState<'tenant_custom' | 'system_env' | 'none'>('none');
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiKeyInput, setAiKeyInput] = useState('');
  const [savingAiKey, setSavingAiKey] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSuccess, setAiSuccess] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load AI configuration status
  const loadAiSettings = async () => {
    try {
      const res = await fetchApi<{
        configured: boolean;
        masked_key: string;
        source: 'tenant_custom' | 'system_env' | 'none';
      }>('/v1/settings/ai');
      setAiConfigured(Boolean(res.configured));
      setAiMaskedKey(res.masked_key || '');
      setAiSource(res.source || 'none');
    } catch (err) {
      console.warn('Failed to load AI settings:', err);
    }
  };

  useEffect(() => {
    loadAiSettings();
  }, []);

  const handleSaveAiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiKeyInput.trim()) {
      setAiError('Vui lòng nhập Gemini API Key');
      return;
    }
    setSavingAiKey(true);
    setAiError('');
    setAiSuccess('');
    try {
      const res = await fetchApi<{ ok: boolean; masked_key: string }>('/v1/settings/ai', {
        method: 'POST',
        body: JSON.stringify({ gemini_api_key: aiKeyInput.trim() }),
      });
      if (res.ok) {
        setAiConfigured(true);
        setAiMaskedKey(res.masked_key);
        setAiSource('tenant_custom');
        setAiSuccess('Đã lưu cấu hình Gemini AI thành công! Zalo Bot đã sẵn sàng đàm thoại thông minh.');
        setAiKeyInput('');
        setTimeout(() => {
          setShowAiModal(false);
          setAiSuccess('');
        }, 1500);
      }
    } catch (err: any) {
      setAiError(err.message || 'Lưu API Key thất bại');
    } finally {
      setSavingAiKey(false);
    }
  };

  // 1. Load list of bots and honor optional ?bot_id= query param
  useEffect(() => {
    async function loadBots() {
      try {
        const res = await fetchApi<{ bots: BotItem[] }>('/v1/bots');
        const loadedBots = res.bots || [];
        setBots(loadedBots);

        const urlBotId =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('bot_id')
            : null;

        if (urlBotId && loadedBots.some((b) => b.id === urlBotId)) {
          setFilterScope(urlBotId);
          setScope('bot');
          setTargetBotId(urlBotId);
        } else if (loadedBots.length > 0) {
          setTargetBotId(loadedBots[0].id);
          setScope('bot');
        } else {
          setScope('all');
        }
      } catch (err) {
        console.error('Failed to load bots:', err);
      } finally {
        setLoading(false);
      }
    }
    loadBots();
  }, []);

  // 2. Load documents based on selected filter scope (strict bot filtering when a specific bot is selected)
  const loadDocs = async (filter: string) => {
    setDocsLoading(true);
    try {
      let endpoint = '/v1/documents';
      if (filter === 'global') {
        endpoint += '?bot_id=global';
      } else if (filter !== 'all') {
        endpoint += `?bot_id=${filter}&strict=1`;
      }
      const res = await fetchApi<{ documents: DocItem[] }>(endpoint);
      setDocs(res.documents || []);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    loadDocs(filterScope);
  }, [filterScope]);

  // 3. Extract text from selected file (.txt, .md, .docx, .pdf, .json, .csv)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingFile(true);
    setError('');
    setAttachedFileName(file.name);

    // Auto-fill title if empty
    const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    if (!title.trim()) {
      setTitle(fileNameWithoutExt);
    }

    try {
      const extractedText = await extractTextFromFile(file);
      if (extractedText.trim()) {
        setContent(extractedText);
      } else {
        setError('Không thể trích xuất văn bản từ tệp này. Bạn vui lòng dán nội dung trực tiếp.');
      }
    } catch (err: unknown) {
      setError(`Lỗi đọc tệp: ${err instanceof Error ? err.message : 'Không xác định'}`);
    } finally {
      setParsingFile(false);
    }
  };

  const handleClearAttachedFile = () => {
    setAttachedFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 4. Create and ingest document
  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError('Vui lòng nhập đầy đủ tiêu đề và nội dung tài liệu.');
      return;
    }

    if (scope === 'bot' && !targetBotId) {
      setError('Vui lòng chọn Zalo Bot áp dụng.');
      return;
    }

    setError('');
    setUploading(true);

    try {
      await fetchApi('/v1/documents', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          scope,
          bot_id: scope === 'bot' ? targetBotId : null,
        }),
      });

      setShowModal(false);
      setTitle('');
      setContent('');
      setAttachedFileName('');
      await loadDocs(filterScope);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi nạp tài liệu');
    } finally {
      setUploading(false);
    }
  };

  // 5. Delete document
  const handleDeleteDoc = async (docId: string) => {
    if (!confirm('Bạn có chắc muốn xóa tài liệu này? Toàn bộ vector tìm kiếm tương ứng sẽ bị gỡ bỏ.')) {
      return;
    }
    try {
      await fetchApi(`/v1/documents/${docId}`, { method: 'DELETE' });
      await loadDocs(filterScope);
    } catch (err) {
      alert('Không thể xóa tài liệu');
    }
  };

  // 6. Open edit document modal and fetch full text
  const handleOpenEditModal = async (doc: DocItem) => {
    setEditingDoc(doc);
    setEditTitle(doc.title);
    setEditScope(doc.bot_id ? 'bot' : 'all');
    setEditTargetBotId(doc.bot_id || (bots[0]?.id || ''));
    setEditContent('');
    setEditError('');
    setShowEditModal(true);
    setLoadingEditContent(true);

    try {
      const res = await fetchApi<{ ok: boolean; title: string; content: string; bot_id: string | null }>(
        `/v1/documents/${doc.id}/content`
      );
      if (res.content) {
        setEditContent(cleanDeduplicatedContent(res.content));
      }
      if (res.title) {
        setEditTitle(res.title);
      }
      if (res.bot_id) {
        setEditScope('bot');
        setEditTargetBotId(res.bot_id);
      } else {
        setEditScope('all');
      }
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Không thể tải nội dung tài liệu');
    } finally {
      setLoadingEditContent(false);
    }
  };

  // 7. Save edited document & re-vectorize
  const handleSaveEditDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc) return;
    if (!editTitle.trim() || !editContent.trim()) {
      setEditError('Vui lòng nhập đầy đủ tiêu đề và nội dung.');
      return;
    }
    if (editScope === 'bot' && !editTargetBotId) {
      setEditError('Vui lòng chọn Bot áp dụng.');
      return;
    }

    setSavingEdit(true);
    setEditError('');

    try {
      const cleaned = cleanDeduplicatedContent(editContent.trim());
      await fetchApi(`/v1/documents/${editingDoc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editTitle.trim(),
          content: cleaned,
          scope: editScope,
          bot_id: editScope === 'bot' ? editTargetBotId : null,
        }),
      });

      setShowEditModal(false);
      setEditingDoc(null);
      await loadDocs(filterScope);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Lỗi cập nhật tài liệu');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Kho Tri thức & RAG
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Quản lý tài liệu thông minh: Áp dụng chung cho toàn bộ Bot hoặc riêng biệt cho từng Zalo Bot
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Scope Filter Selector */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm text-xs font-semibold">
            <span className="text-slate-400">Xem:</span>
            <select
              value={filterScope}
              onChange={(e) => setFilterScope(e.target.value)}
              className="bg-transparent text-slate-700 font-bold focus:outline-none cursor-pointer"
            >
              <option value="all">Tất cả tài liệu (Toàn tổ chức)</option>
              <option value="global">🌐 Dùng chung (Mọi Bot)</option>
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  🤖 Bot: {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* AI Settings Quick Action */}
          <button
            onClick={() => {
              setShowAiModal(true);
              setAiError('');
              setAiSuccess('');
            }}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition border shadow-sm ${
              aiConfigured
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 ring-2 ring-amber-400/40 animate-pulse'
            }`}
          >
            <Sparkles className={`h-4 w-4 ${aiConfigured ? 'text-emerald-600' : 'text-amber-600'}`} />
            <span>
              {aiConfigured
                ? `Gemini AI: Đã kết nối (${aiMaskedKey})`
                : '⚡ Cấu hình Gemini AI'}
            </span>
          </button>

          <button
            onClick={() => {
              setShowModal(true);
              setError('');
              setTitle('');
              setContent('');
              setAttachedFileName('');
              if (filterScope !== 'all' && filterScope !== 'global') {
                setScope('bot');
                setTargetBotId(filterScope);
              } else if (bots.length > 0) {
                setScope('bot');
                if (!targetBotId) setTargetBotId(bots[0].id);
              } else {
                setScope('all');
              }
            }}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition"
          >
            <Plus className="h-4 w-4" />
            Nạp tài liệu mới
          </button>
        </div>
      </div>

      {/* Main Content Table */}
      {loading || docsLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center bg-white">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 mb-4">
            <BookOpen className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Chưa có tài liệu nào trong phạm vi này</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
            Hãy nạp tài liệu hướng dẫn, chính sách bán hàng hoặc đính kèm tệp Word/PDF để Bot có căn cứ trả lời khách hàng.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
          >
            <Plus className="h-4 w-4" />
            Nạp tài liệu ngay
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="py-3.5 px-6">Tên tài liệu</th>
                <th className="py-3.5 px-6">Phạm vi áp dụng</th>
                <th className="py-3.5 px-6">Trạng thái RAG</th>
                <th className="py-3.5 px-6">Số đoạn (Chunks)</th>
                <th className="py-3.5 px-6">Dung lượng</th>
                <th className="py-3.5 px-6">Ngày nạp</th>
                <th className="py-3.5 px-6 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-4 px-6 font-semibold flex items-center gap-2 text-slate-900">
                    <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                    <span className="truncate max-w-xs">{doc.title}</span>
                  </td>
                  <td className="py-4 px-6">
                    {doc.bot_id ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 border border-indigo-200">
                        <Bot className="h-3 w-3" />
                        Riêng: {doc.bot_name || 'Bot chỉ định'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                        <Globe className="h-3 w-3" />
                        Dùng chung (Mọi Bot)
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-6">
                    {doc.status === 'ready' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="h-3 w-3" /> Đã sẵn sàng
                      </span>
                    ) : doc.status === 'processing' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
                        <Clock className="h-3 w-3 animate-spin" /> Đang vector hóa
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 border border-red-200">
                        <AlertCircle className="h-3 w-3" /> Lỗi nạp
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-6 font-mono">{doc.chunk_count} đoạn</td>
                  <td className="py-4 px-6">{(doc.size_bytes / 1024).toFixed(1)} KB</td>
                  <td className="py-4 px-6 text-slate-500">
                    {new Date(doc.created_at).toLocaleDateString('vi-VN')}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => handleOpenEditModal(doc)}
                        className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1 hover:underline"
                        title="Chỉnh sửa nội dung & phạm vi tài liệu"
                      >
                        <Edit3 className="h-3.5 w-3.5" /> Sửa
                      </button>
                      <button
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="text-red-500 hover:text-red-700 font-medium inline-flex items-center gap-1 hover:underline"
                        title="Xóa tài liệu và các vector tìm kiếm"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- ADD DOCUMENT MODAL WITH ATTACHMENT SUPPORT --- */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Nạp tài liệu mới vào Kho Tri thức
                </h2>
                <p className="text-xs text-slate-500">
                  Đính kèm tệp văn bản hoặc dán nội dung để hệ thống tự động bóc tách & vector hóa RAG
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs text-red-600 border border-red-100">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateDocument} className="space-y-4">
              {/* 1. Scope Selection (Ưu tiên gán riêng cho từng Bot để cách ly dữ liệu RAG) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Phạm vi áp dụng tài liệu <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    className={`flex items-start gap-3 p-3.5 rounded-xl border text-xs cursor-pointer transition ${
                      scope === 'bot'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 font-semibold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="scope"
                      value="bot"
                      checked={scope === 'bot'}
                      onChange={() => setScope('bot')}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div>
                      <div className="flex items-center gap-1 font-bold text-slate-900">
                        <Bot className="h-3.5 w-3.5 text-indigo-600" />
                        Áp dụng riêng cho 1 Bot (Khuyên dùng)
                      </div>
                      <p className="text-[11px] text-slate-500 font-normal mt-0.5">
                        Chỉ Zalo Bot được chỉ định mới đọc tài liệu này, tránh lẫn giữa các Bot.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 p-3.5 rounded-xl border text-xs cursor-pointer transition ${
                      scope === 'all'
                        ? 'border-blue-600 bg-blue-50/60 text-blue-950 font-semibold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="scope"
                      value="all"
                      checked={scope === 'all'}
                      onChange={() => setScope('all')}
                      className="mt-0.5 text-blue-600"
                    />
                    <div>
                      <div className="flex items-center gap-1 font-bold text-slate-900">
                        <Globe className="h-3.5 w-3.5 text-blue-600" />
                        Dùng chung (Mọi Bot cùng đọc)
                      </div>
                      <p className="text-[11px] text-slate-500 font-normal mt-0.5">
                        Chỉ dùng cho quy định chung áp dụng cho tất cả Bot không bật chế độ tách riêng.
                      </p>
                    </div>
                  </label>
                </div>

                {scope === 'bot' && (
                  <div className="mt-3">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Chọn Bot chỉ định:
                    </label>
                    <select
                      value={targetBotId}
                      onChange={(e) => setTargetBotId(e.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold focus:border-blue-600 focus:outline-none"
                    >
                      <option value="">-- Chọn Zalo Bot áp dụng --</option>
                      {bots.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} {b.username ? `(@${b.username})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* 2. File Attachment Section (Đính kèm file) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Đính kèm tệp tài liệu (Word, PDF, Text, Markdown)</span>
                  <span className="text-[11px] font-normal text-slate-400">Hỗ trợ .docx, .pdf, .txt, .md, .json, .csv</span>
                </label>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition flex flex-col items-center justify-center gap-1"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.markdown,.docx,.pdf,.json,.csv,.xml,.html"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  {parsingFile ? (
                    <div className="flex items-center gap-2 text-xs text-blue-600 font-medium py-2">
                      <Clock className="h-4 w-4 animate-spin" />
                      Đang đọc và trích xuất nội dung văn bản từ tệp...
                    </div>
                  ) : attachedFileName ? (
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                      <Paperclip className="h-4 w-4 text-emerald-600" />
                      <span>{attachedFileName}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearAttachedFile();
                        }}
                        className="text-slate-400 hover:text-red-500 ml-1"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-1">
                        <UploadCloud className="h-5 w-5 text-blue-600" />
                      </div>
                      <p className="text-xs font-semibold text-slate-700">
                        Bấm để chọn tệp từ máy tính
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Hệ thống sẽ tự động đọc nội dung và điền tiêu đề vào biểu mẫu bên dưới
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* 3. Document Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Tiêu đề tài liệu <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ví dụ: Bảng giá & Menu món ăn - Five Star 2026"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              {/* 4. Document Content (Textarea Preview & Edit) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Nội dung tài liệu <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {content.length.toLocaleString()} ký tự ~ {Math.ceil(content.length / 4)} tokens
                  </span>
                </div>
                <textarea
                  required
                  rows={8}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Nội dung sẽ tự động điền khi bạn đính kèm tệp, hoặc bạn có thể gõ/dán trực tiếp tại đây..."
                  className="w-full rounded-xl border border-slate-200 p-3 text-xs focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Hệ thống chia nhỏ tài liệu thành các đoạn 500-600 tokens và vector hóa bằng mô hình Text Embedding.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={uploading || parsingFile}
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
                >
                  {uploading ? (
                    <>
                      <Clock className="h-3.5 w-3.5 animate-spin" /> Đang vector hóa RAG...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Lưu & Vectorize
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- GEMINI AI CONFIGURATION MODAL --- */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Cấu hình Google Gemini AI
                  </h2>
                  <p className="text-xs text-slate-500">
                    Kích hoạt mô hình AI đọc hiểu Kho Tri thức cho Zalo Bot
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAiModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Current Status Badge */}
            <div className="mb-4 rounded-xl p-3 bg-slate-50 border border-slate-200 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-medium">Trạng thái hiện tại:</span>
                {aiConfigured ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                    <CheckCircle2 className="h-3 w-3" /> Đã kết nối ({aiMaskedKey})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-md">
                    <AlertCircle className="h-3 w-3" /> Chưa cài đặt
                  </span>
                )}
              </div>
            </div>

            {aiError && (
              <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs text-red-600 border border-red-100 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{aiError}</span>
              </div>
            )}

            {aiSuccess && (
              <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700 border border-emerald-200 flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{aiSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveAiKey} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Gemini API Key <span className="text-red-500">*</span></span>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 normal-case tracking-normal"
                  >
                    <span>Lấy Key miễn phí tại Google AI Studio</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Key className="h-4 w-4" />
                  </div>
                  <input
                    type="password"
                    value={aiKeyInput}
                    onChange={(e) => setAiKeyInput(e.target.value)}
                    placeholder={aiConfigured ? `Đã có key (${aiMaskedKey}) - Nhập key mới nếu muốn đổi` : 'Dán chuỗi API Key bắt đầu bằng AIzaSy...'}
                    className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-xs font-mono focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
                  💡 API Key này sẽ được dùng để vector hóa tài liệu RAG và giúp Bot trả lời tự nhiên theo đúng thực đơn, bảng giá và chính sách của quán.
                </p>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAiModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={savingAiKey}
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
                >
                  {savingAiKey ? (
                    <>
                      <Clock className="h-3.5 w-3.5 animate-spin" /> Đang lưu...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Lưu & Kích hoạt AI
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT DOCUMENT MODAL --- */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Edit3 className="h-5 w-5 text-blue-600" />
                  Chỉnh sửa Kho Tri thức & Cập nhật RAG
                </h2>
                <p className="text-xs text-slate-500">
                  Cập nhật nội dung, giá sản phẩm, chính sách hoặc thay đổi phạm vi bot áp dụng
                </p>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs text-red-600 border border-red-100">
                {editError}
              </div>
            )}

            {loadingEditContent ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
                <Clock className="h-6 w-6 animate-spin text-blue-600" />
                <span className="text-xs">Đang tải toàn bộ nội dung từ vector store...</span>
              </div>
            ) : (
              <form onSubmit={handleSaveEditDocument} className="space-y-4">
                {/* 1. Scope Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Phạm vi áp dụng tài liệu <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition ${
                        editScope === 'all'
                          ? 'border-blue-600 bg-blue-50/60 text-blue-950 font-semibold'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="editScope"
                        value="all"
                        checked={editScope === 'all'}
                        onChange={() => setEditScope('all')}
                        className="mt-0.5 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-slate-900">
                          <Globe className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Dùng chung (Toàn tổ chức)</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 font-normal">
                          Mọi Zalo Bot trong tổ chức đều có quyền truy xuất tài liệu này
                        </p>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition ${
                        editScope === 'bot'
                          ? 'border-blue-600 bg-blue-50/60 text-blue-950 font-semibold'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="editScope"
                        value="bot"
                        checked={editScope === 'bot'}
                        onChange={() => setEditScope('bot')}
                        className="mt-0.5 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-slate-900">
                          <Bot className="h-3.5 w-3.5 text-indigo-600" />
                          <span>Áp dụng riêng cho từng Bot</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 font-normal">
                          Chỉ bot được chỉ định mới đọc được kiến thức này
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Bot dropdown if scope === 'bot' */}
                {editScope === 'bot' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Chọn Zalo Bot áp dụng <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={editTargetBotId}
                      onChange={(e) => setEditTargetBotId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-medium focus:border-blue-600 focus:outline-none"
                    >
                      <option value="">-- Chọn Bot áp dụng --</option>
                      {bots.map((b) => (
                        <option key={b.id} value={b.id}>
                          🤖 {b.name} ({b.id.slice(0, 8)}...)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 2. Document Title */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Tiêu đề tài liệu <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="VD: Bảng giá thực đơn cập nhật 2026..."
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-blue-600 focus:outline-none"
                  />
                </div>

                {/* 3. Document Content */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Nội dung kiến thức (Markdown / Văn bản) <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={10}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Chỉnh sửa nội dung chi tiết..."
                    className="w-full rounded-xl border border-slate-200 p-3 text-xs font-mono leading-relaxed focus:border-blue-600 focus:outline-none resize-y"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    ⚡ Hệ thống sẽ tự động cắt nhỏ đoạn (chunking) và tính toán vector embeddings mới ngay khi bấm Lưu.
                  </p>
                </div>

                {/* Submit button */}
                <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
                  >
                    {savingEdit ? (
                      <>
                        <Clock className="h-3.5 w-3.5 animate-spin" /> Đang cập nhật & Vector hóa...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Lưu thay đổi RAG
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to extract text from various file formats (.txt, .md, .docx, .pdf, .json, .csv)
async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  // Plain text, markdown, json, csv
  if (
    name.endsWith('.txt') ||
    name.endsWith('.md') ||
    name.endsWith('.markdown') ||
    name.endsWith('.json') ||
    name.endsWith('.csv') ||
    name.endsWith('.html') ||
    name.endsWith('.xml')
  ) {
    return await file.text();
  }

  // Word Document (.docx)
  if (name.endsWith('.docx')) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const view = new DataView(arrayBuffer);
      let offset = 0;
      while (offset < bytes.length - 30) {
        if (view.getUint32(offset, true) === 0x04034b50) {
          const compression = view.getUint16(offset + 8, true);
          const compressedSize = view.getUint32(offset + 18, true);
          const fileNameLen = view.getUint16(offset + 26, true);
          const extraLen = view.getUint16(offset + 28, true);
          const fileNameBytes = bytes.subarray(offset + 30, offset + 30 + fileNameLen);
          const fileName = new TextDecoder().decode(fileNameBytes);
          const dataOffset = offset + 30 + fileNameLen + extraLen;

          if (fileName === 'word/document.xml') {
            const compressedData = bytes.subarray(dataOffset, dataOffset + compressedSize);
            let xmlStr = '';
            if (compression === 8 && typeof DecompressionStream !== 'undefined') {
              const ds = new DecompressionStream('deflate-raw');
              const writer = ds.writable.getWriter();
              writer.write(compressedData);
              writer.close();
              const reader = ds.readable.getReader();
              const chunks: Uint8Array[] = [];
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) chunks.push(value);
              }
              const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
              const merged = new Uint8Array(totalLen);
              let pos = 0;
              for (const c of chunks) {
                merged.set(c, pos);
                pos += c.length;
              }
              xmlStr = new TextDecoder().decode(merged);
            } else {
              xmlStr = new TextDecoder().decode(compressedData);
            }
            return xmlStr.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          }
          offset = dataOffset + compressedSize;
        } else {
          offset++;
        }
      }
    } catch (docxErr) {
      console.warn('Docx extraction warning:', docxErr);
    }
  }

  // PDF Document (.pdf)
  if (name.endsWith('.pdf')) {
    try {
      const rawText = await file.text();
      const matches = rawText.match(/\((.*?)\)\s*Tj/g) || rawText.match(/\[(.*?)\]\s*TJ/g);
      if (matches && matches.length > 0) {
        return matches
          .map((m) =>
            m
              .replace(/^[\(\[]|[\)\]]\s*T[jJ]$/g, '')
              .replace(/\\([()\\])/g, '$1')
          )
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      return rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ').replace(/\s+/g, ' ').trim();
    } catch (pdfErr) {
      console.warn('PDF extraction warning:', pdfErr);
    }
  }

  // Fallback to text reading
  return await file.text();
}

/**
 * Strips out accidental duplicate lines, headings or paragraphs from text
 */
function cleanDeduplicatedContent(text: string): string {
  if (!text) return '';
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const lines = normalized.split('\n');
  const cleanLines: string[] = [];
  let lastNonEmpty = '';

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed !== '') {
      if (trimmed === lastNonEmpty) {
        continue;
      }
      lastNonEmpty = trimmed;
    }
    cleanLines.push(raw);
  }

  const cleanText = cleanLines.join('\n');
  const paragraphs = cleanText.split(/\n\s*\n/);
  const cleanParas: string[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    if (!p) continue;
    if (cleanParas.length > 0 && cleanParas[cleanParas.length - 1] === p) {
      continue;
    }
    cleanParas.push(p);
  }

  return cleanParas.join('\n\n');
}
