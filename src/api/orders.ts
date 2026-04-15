import request from './request'
import type { ApiResponse } from './request'

export interface CreateOrderRequest {
  user_id: number | string
  product_type: 'trial' | 'monthly' | 'yearly' | 'booster'
  months?: number
  pay_channel: 'wechat' | 'alipay'
}

export interface Order {
  id: number
  order_no: string
  user_id: number
  payer_id: number
  product_type: string
  months: number
  amount: number
  pay_channel: string
  pay_status: 'pending' | 'paid' | 'refunded' | 'closed'
  code_url: string
  paid_at: string | null
  expired_at: string
  created_at: string
}

export function createOrder(data: CreateOrderRequest): Promise<ApiResponse<Order>> {
  return request.post('/v1/orders', data)
}

export function listOrders(
  offset = 0,
  limit = 20
): Promise<ApiResponse<{ items: Order[]; total: number }>> {
  return request.get('/v1/orders', {
    params: { offset, limit }
  })
}

export function getOrder(orderId: number): Promise<ApiResponse<Order>> {
  return request.get(`/v1/orders/${orderId}`)
}
