import request from './request'

export function getCreditBalance() {
  return request.get<{ balance: number }>('/v1/credits/balance')
}
