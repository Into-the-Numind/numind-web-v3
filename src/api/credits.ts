import request from './request'

export interface QuotaBreakdown {
  balance: number
  sub_total: number
  sub_remain: number
  booster_total: number
  booster_remain: number
}

export function getCreditBalance() {
  return request.get<QuotaBreakdown>('/v1/credits/balance')
}
