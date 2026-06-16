import request from './request'
import type { ApiResponse } from './request'
import type { DocumentDTO, OpenDocReq, SaveDocReq, ExportFormat } from '@/types/document'

// 打开/懒建档一个 agent 生成产物为可编辑文档。
export const openDocument = (p: OpenDocReq): Promise<ApiResponse<DocumentDTO>> =>
  request.post('/v1/documents/open', p)

// 取文档（重开，返回上次编辑版）。
export const getDocument = (id: number): Promise<ApiResponse<DocumentDTO>> =>
  request.get(`/v1/documents/${id}`)

// 保存文档正文/标题（自动保存）。
export const saveDocument = (
  id: number,
  p: SaveDocReq
): Promise<ApiResponse<{ id: number; updated_at: string }>> => request.put(`/v1/documents/${id}`, p)

// 导出下载文档。responseType blob 经 request 拦截器放行，直接得到 Blob。
export const exportDocument = (id: number, format: ExportFormat): Promise<Blob> =>
  request.get(`/v1/documents/${id}/export`, {
    params: { format },
    responseType: 'blob'
  }) as unknown as Promise<Blob>
