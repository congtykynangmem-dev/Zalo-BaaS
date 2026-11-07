'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import { BookOpen, Plus, Trash2, FileText, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

interface BotItem {
  id: string;
  name: string;
}

interface DocItem {
  id: string;
  title: string;
  size_bytes: number;
  status: 'ready' | 'processing' | 'failed';
  chunk_count: number;
  created_at: number;
}

export default function KnowledgePage() {
  const [bots, setBots] = useState<BotItem[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string>('');
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [docsLoading, setDocsLoading] = useState(false);

  // Upload modal state
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadBots() {
      try {
        const res = await fetchApi<{ bots: BotItem[] }>('/v1/bots');
        setBots(res.bots);
        if (res.bots.length > 0) {
          setSelectedBotId(res.bots[0].id);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadBots();
  }, []);

  const loadDocs = async (botId: string) => {
    if (!botId) return;
    setDocsLoading(true);
    try {
      const res = await fetchApi<{ documents: DocItem[] }>(`/v1/bots/${botId}/documents`);
      setDocs(res.documents);
    } catch (err) {
      console.error(err);
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedBotId) {
      loadDocs(selectedBotId);
    }
  }, [selectedBotId]);

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBotId) return;
    setError('');
    setUploading(true);

    try {
      await fetchApi(`/v1/bots/${selectedBotId}/documents`, {
        method: 'POST',
        body: JSON.stringify({ title, content }),
      });

      setShowModal(false);
      setTitle('');
      setContent('');
      await loadDocs(selectedBotId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi nạp tài liệu');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm('Bạn có chắc muốn xóa tài liệu này? Các vector tìm kiếm sẽ bị hủy.')) return;
    try {
      await fetchApi(`/v1/documents/${docId}`, { method: 'DELETE' });
      await loadDocs(selectedBotId);
    } catch (err) {
      alert('Không thể xóa tài liệu');
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
            Nạp tài liệu, chính sách, bảng giá để AI tự động học và trả lời khách hàng
          </p>
        </div>

        <div className="flex items-center gap-3">
          {bots.length > 0 && (
            <select
              value={selectedBotId}
              onChange={(e) => setSelectedBotId(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-blue-600 focus:outline-none"
            >
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  Bot: {b.name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => {
              setShowModal(true);
              setError('');
            }}
            disabled={!selectedBotId}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Thêm tài liệu mới
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
          <h3 className="text-lg font-bold text-slate-900">Kho tri thức đang trống</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
            Hãy nạp tài liệu hướng dẫn sử dụng, chính sách bán hàng hoặc FAQ để bot có căn cứ trả lời chính xác.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Nạp tài liệu đầu tiên
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="py-3.5 px-6">Tên tài liệu</th>
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
                    <FileText className="h-4 w-4 text-blue-600" />
                    {doc.title}
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
                    <button
                      onClick={() => handleDeleteDoc(doc.id)}
                      className="text-red-500 hover:text-red-700 font-medium inline-flex items-center gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- ADD DOCUMENT MODAL --- */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                Nạp tài liệu mới vào Kho Tri thức
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600"
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
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Tiêu đề tài liệu <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ví dụ: Chính sách bảo hành & đổi trả 2026"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Nội dung tài liệu (Văn bản thuần hoặc Markdown) <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={8}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Dán nội dung hướng dẫn, bảng giá, quy định..."
                  className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-xs focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Hệ thống sẽ tự động bóc tách thành các đoạn 500-600 tokens và vector hóa bằng mô hình Text Embedding.
                </p>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploading ? 'Đang vector hóa...' : 'Lưu & Vectorize'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

