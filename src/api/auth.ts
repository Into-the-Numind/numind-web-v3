import request from './request'
import type { ApiResponse } from './request'

export interface LoginParams {
  username: string
  password: string
}

export interface LoginData {
  access_token?: string
  token?: string
  user?: {
    id: string | number
    username: string
    nickname?: string
    avatar?: string
    email?: string
    phone?: string
    role?: string
    [key: string]: any
  }
}

// 登录
export const login = (params: LoginParams): Promise<ApiResponse<LoginData>> => {
  return request.post('/v1/web/login', params)
}

// 获取用户信息（包含等级、用量统计等完整数据）
export const getUserInfo = (): Promise<ApiResponse<any>> => {
  return request.get('/v1/users/me')
}

// 更新当前用户个人信息（org-branding：company_name 仅父账户可写，子账户后端忽略）
export interface UpdateProfileParams {
  nickname?: string
  avatar_url?: string
  company_name?: string
}

export const updateProfile = (data: UpdateProfileParams): Promise<ApiResponse<null>> => {
  return request.put('/v1/users/me', data)
}

// 退出登录
export const logout = (): Promise<ApiResponse<null>> => {
  return request.post('/v1/web/logout')
}

// 修改密码
export const changePassword = (data: {
  oldPassword: string
  newPassword: string
}): Promise<ApiResponse<null>> => {
  return request.post('/v1/web/user/password', data)
}
