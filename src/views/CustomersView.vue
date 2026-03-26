<template>
  <MainLayout>
    <div class="customers-page">
      <!-- 加载状态 -->
      <div v-if="isLoading" class="loading-state">
        <div class="loading-spinner"></div>
        <div class="loading-text">加载中...</div>
      </div>

      <template v-else>
        <!-- Hero 区域 -->
        <div class="hero-section">
          <div class="hero-content">
            <h1 class="hero-title">客户管理</h1>
            <p class="hero-subtitle">管理您的子用户、模板权限与会员等级</p>
          </div>
          <button class="hero-action-btn" @click="showRegisterModal = true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>
            </svg>
            注册新用户
          </button>
        </div>

        <!-- 统计卡片 -->
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">总子用户数：</span>
            <span class="stat-value">{{ statistics.total_sub_users ?? '-' }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">活跃子用户：</span>
            <span class="stat-value">{{ statistics.active_sub_users ?? '-' }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">可用模板数：</span>
            <span class="stat-value">{{ statistics.total_templates ?? '-' }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">总运行次数：</span>
            <span class="stat-value">{{ statistics.total_runs ?? '-' }}</span>
          </div>
        </div>

        <!-- 筛选栏 -->
        <div class="toolbar">
          <div class="filter-bar">
            <button
              class="filter-btn"
              :class="{ active: activeFilter === 'all' }"
              @click="setFilter('all')"
            >
              全部
              <span class="filter-count">{{ allSubUsers.length }}</span>
            </button>
            <button
              class="filter-btn"
              :class="{ active: activeFilter === 'free' }"
              @click="setFilter('free')"
            >
              <span class="filter-dot free"></span>
              免费用户
              <span class="filter-count">{{ freeCount }}</span>
            </button>
            <button
              class="filter-btn"
              :class="{ active: activeFilter === 'trial' }"
              @click="setFilter('trial')"
            >
              <span class="filter-dot trial"></span>
              体验会员
              <span class="filter-count">{{ trialCount }}</span>
            </button>
            <button
              class="filter-btn"
              :class="{ active: activeFilter === 'standard' }"
              @click="setFilter('standard')"
            >
              <span class="filter-dot standard"></span>
              普通会员
              <span class="filter-count">{{ standardCount }}</span>
            </button>
            <button
              class="filter-btn"
              :class="{ active: activeFilter === 'premium' }"
              @click="setFilter('premium')"
            >
              <span class="filter-dot premium"></span>
              高级会员
              <span class="filter-count">{{ premiumCount }}</span>
            </button>
          </div>
          <div class="search-box">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input
              v-model="searchQuery"
              type="text"
              class="search-input"
              placeholder="搜索昵称或手机号..."
              @input="handleSearch"
            />
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="allSubUsers.length === 0" class="empty-state">
          <div class="empty-icon-wrapper">
            <svg viewBox="0 0 48 48" fill="none" class="empty-icon">
              <path d="M32 42v-4a8 8 0 0 0-8-8H12a8 8 0 0 0-8 8v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <circle cx="18" cy="14" r="8" stroke="currentColor" stroke-width="2"/>
              <path d="M44 42v-4a8 8 0 0 0-6-7.75" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M32 6.25a8 8 0 0 1 0 15.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="empty-title">暂无子用户</div>
          <div class="empty-desc">注册新用户后，他们将显示在此处</div>
          <button class="empty-action" @click="showRegisterModal = true">注册新用户</button>
        </div>

        <!-- 筛选后无结果 -->
        <div v-else-if="filteredUsers.length === 0" class="empty-state compact">
          <div class="empty-title">没有匹配的用户</div>
          <div class="empty-desc">切换筛选条件或修改搜索关键词</div>
        </div>

        <!-- 表格容器 -->
        <div v-else class="table-container">
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="col-check">
                    <span
                      class="checkbox-mark"
                      :class="{ checked: isAllSelected }"
                      @click="toggleSelectAll"
                    >
                      <svg v-if="isAllSelected" viewBox="0 0 12 12" fill="none" width="12" height="12">
                        <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </span>
                  </th>
                  <th class="col-user">用户信息</th>
                  <th>用户等级</th>
                  <th>到期时间</th>
                  <th>已授权模板</th>
                  <th>总运行次数</th>
                  <th>本月运行</th>
                  <th class="col-action">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="user in pageUsers"
                  :key="user.id || user.user_id"
                  :class="{ 'row-selected': selectedIds.has(user.user_id ?? user.id) }"
                >
                  <td class="col-check">
                    <span
                      class="checkbox-mark"
                      :class="{ checked: selectedIds.has(user.user_id ?? user.id) }"
                      @click="toggleSelect(user.user_id ?? user.id)"
                    >
                      <svg v-if="selectedIds.has(user.user_id ?? user.id)" viewBox="0 0 12 12" fill="none" width="12" height="12">
                        <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </span>
                  </td>
                  <td class="col-user">
                    <div class="user-info">
                      <div class="user-name">{{ user.nickname || '未命名用户' }}</div>
                      <div class="user-meta">{{ user.phone || ('ID: ' + (user.user_id ?? user.id)) }}</div>
                    </div>
                  </td>
                  <td>
                    <span class="tier-badge" :class="getTierClass(user)">
                      <span class="tier-dot"></span>
                      {{ getTierLabel(user) }}
                    </span>
                  </td>
                  <td>
                    <span class="cell-secondary">{{ user.tier_expires ? formatDate(user.tier_expires) : '-' }}</span>
                  </td>
                  <td>
                    <span class="cell-metric">{{ user.authorized_templates || user.template_count || 0 }}</span>
                  </td>
                  <td>
                    <span class="cell-metric">{{ user.total_sop_runs || 0 }}</span>
                  </td>
                  <td>
                    <span class="cell-metric">{{ user.monthly_sop_runs || 0 }}</span>
                  </td>
                  <td class="col-action">
                    <div class="action-dropdown">
                      <button
                        class="action-trigger"
                        aria-haspopup="true"
                        :aria-expanded="openMenuId === (user.user_id ?? user.id)"
                        @click.stop="toggleActionMenu(user.user_id ?? user.id)"
                        @keydown.escape="openMenuId = null"
                      >
                        管理
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </button>
                      <div v-if="openMenuId === (user.user_id ?? user.id)" class="action-menu" role="menu">
                        <button class="action-menu-item" role="menuitem" @click="handleMenuPermission(user)">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>
                          </svg>
                          管理权限
                        </button>
                        <button
                          class="action-menu-item"
                          role="menuitem"
                          :class="{ disabled: !canUpgrade(user) }"
                          :disabled="!canUpgrade(user)"
                          @click="handleMenuUpgrade(user)"
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="m18 15-6-6-6 6"/>
                          </svg>
                          升级等级
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 分页 -->
          <div v-if="totalPages > 1" class="pagination">
            <button class="page-btn" :disabled="currentPage <= 1" @click="currentPage--">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              上一页
            </button>
            <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
            <button class="page-btn" :disabled="currentPage >= totalPages" @click="currentPage++">
              下一页
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        </div>
      </template>

      <!-- 批量操作浮动栏 -->
      <Transition name="bar-slide">
        <div v-if="selectedIds.size > 0" class="manage-bar">
          <span class="manage-count">已选 {{ selectedIds.size }} 项</span>
          <button class="manage-select-all" @click="toggleSelectAll">
            {{ isAllSelected ? '取消全选' : '全选' }}
          </button>
          <button class="manage-btn-grant" @click="batchGrant">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>
            </svg>
            批量授权
          </button>
          <button class="manage-btn-revoke" @click="batchRevoke">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            批量撤销
          </button>
        </div>
      </Transition>

      <!-- ========== Register Modal ========== -->
      <Teleport to="body">
        <Transition name="overlay-fade">
          <div v-if="showRegisterModal" class="modal-overlay" @mousedown.self="closeRegisterModal">
            <div class="modal-dialog register-dialog">
              <div class="modal-header">
                <h2 class="modal-title">注册新用户</h2>
                <button class="modal-close" @click="closeRegisterModal">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
              <form id="register-form" class="modal-body" @submit.prevent="handleRegister">
                <div class="form-group">
                  <label class="form-label">用户名（用于登录）<span class="required">*</span></label>
                  <div class="input-row">
                    <input v-model="registerForm.username" type="text" class="form-input" :class="{ 'input-error': regFieldErrors.username }" placeholder="3-20位字母及数字" maxlength="20" required />
                    <button type="button" class="btn-inline" :disabled="!registerForm.username.trim() || usernameStatus === 'checking'" @click="checkUsernameAvailability">
                      {{ usernameStatus === 'checking' ? '检测中...' : '检测' }}
                    </button>
                  </div>
                  <div v-if="regFieldErrors.username" class="field-error">{{ regFieldErrors.username }}</div>
                  <div v-else-if="usernameStatus && usernameStatus !== 'checking'" class="field-hint" :class="usernameStatus">
                    {{ usernameStatus === 'available' ? '用户名可用' : '用户名已被使用' }}
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">密码 <span class="required">*</span></label>
                  <input v-model="registerForm.password" type="text" class="form-input" :class="{ 'input-error': regFieldErrors.password }" placeholder="6-18位字母、数字或常用符号" maxlength="18" required />
                  <div v-if="regFieldErrors.password" class="field-error">{{ regFieldErrors.password }}</div>
                </div>
                <div class="form-group">
                  <label class="form-label">昵称 <span class="required">*</span></label>
                  <input v-model="registerForm.nickname" type="text" class="form-input" :class="{ 'input-error': regFieldErrors.nickname }" placeholder="2-20位字符" maxlength="20" required />
                  <div v-if="regFieldErrors.nickname" class="field-error">{{ regFieldErrors.nickname }}</div>
                </div>

                <!-- 会员设置 -->
                <div class="tier-section">
                  <div class="tier-divider"><span>会员设置（可选）</span></div>
                  <div class="tier-toggle">
                    <label class="tier-option" :class="{ active: registerForm.tier === 'trial' }">
                      <input v-model="registerForm.tier" type="radio" name="register-tier" value="trial" />
                      <span>体验会员</span>
                    </label>
                    <label class="tier-option" :class="{ active: registerForm.tier === 'standard' }">
                      <input v-model="registerForm.tier" type="radio" name="register-tier" value="standard" />
                      <span>普通会员</span>
                    </label>
                    <label class="tier-option" :class="{ active: registerForm.tier === 'premium' }">
                      <input v-model="registerForm.tier" type="radio" name="register-tier" value="premium" />
                      <span>高级会员</span>
                    </label>
                  </div>
                  <div v-if="registerForm.tier === 'trial'" class="tier-detail">
                    <div class="tier-preview">体验会员：3天 / 10次SOP运行 / ¥9.9</div>
                  </div>
                  <div v-if="registerForm.tier !== 'free' && registerForm.tier !== 'trial'" class="tier-detail">
                    <div class="form-group form-group--compact">
                      <label class="form-label">开通时长</label>
                      <select v-model="registerForm.months" class="form-input form-select">
                        <option v-for="m in 12" :key="m" :value="m">{{ m }} 个月</option>
                      </select>
                    </div>
                    <div class="tier-preview">到期日期：<strong>{{ registerExpirePreview }}</strong></div>
                  </div>
                </div>
                <div v-if="registerError" class="form-error">{{ registerError }}</div>
              </form>
              <div class="modal-footer">
                <button type="button" class="btn-cancel" @click="closeRegisterModal">取消</button>
                <button type="submit" form="register-form" class="btn-primary" :disabled="!isRegFormValid || isRegistering">
                  {{ isRegistering ? '注册中...' : '注册' }}
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- ========== Permission Modal ========== -->
      <Teleport to="body">
        <Transition name="overlay-fade">
          <div v-if="showPermModal" class="modal-overlay" @click.self="closePermissionModal">
            <div class="modal-dialog perm-dialog">
              <div class="modal-header">
                <h2 class="modal-title">管理模板权限</h2>
                <button class="modal-close" @click="closePermissionModal">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
              <div class="modal-body perm-body">
                <!-- User info -->
                <div class="perm-user">
                  <div class="perm-avatar">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                  <div>
                    <div class="perm-name">{{ permTarget?.nickname || permTarget?.username || '用户' }}</div>
                    <div class="perm-meta">{{ permTarget?.phone || ('ID: ' + (permTarget?.user_id ?? permTarget?.id)) }}</div>
                  </div>
                </div>

                <div v-if="permLoading" class="perm-loading">
                  <div class="loading-spinner"></div>
                </div>

                <!-- Feature Permissions -->
                <div v-if="!permLoading" class="perm-group">
                  <div class="perm-group-title"><span>功能权限</span></div>
                  <div class="perm-list">
                    <div
                      class="perm-item"
                      :class="{ checked: featurePermissions['sales_agent'] }"
                      @click="featurePermissions['sales_agent'] = !featurePermissions['sales_agent']"
                    >
                      <span class="checkbox-mark" :class="{ checked: featurePermissions['sales_agent'] }">
                        <svg v-if="featurePermissions['sales_agent']" viewBox="0 0 12 12" fill="none" width="12" height="12">
                          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </span>
                      <span class="perm-item-label">销售智能体</span>
                    </div>
                  </div>
                </div>

                <!-- Template Permissions -->
                <div v-if="!permLoading" class="perm-group">
                  <div class="perm-group-title">
                    <span>可用模板</span>
                    <span class="perm-badge">{{ allTemplates.length }}</span>
                    <button type="button" class="perm-toggle-all" @click="togglePermSelectAll">
                      {{ isPermAllSelected ? '取消全选' : '全选' }}
                    </button>
                  </div>
                  <div class="perm-list">
                    <div
                      v-for="tpl in allTemplates"
                      :key="tpl.id"
                      class="perm-item"
                      :class="{ checked: permSelectedIds[String(tpl.id)] }"
                      @click="togglePermTemplate(String(tpl.id))"
                    >
                      <span class="checkbox-mark" :class="{ checked: permSelectedIds[String(tpl.id)] }">
                        <svg v-if="permSelectedIds[String(tpl.id)]" viewBox="0 0 12 12" fill="none" width="12" height="12">
                          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </span>
                      <span class="perm-item-label">{{ tpl.name }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn-cancel" @click="closePermissionModal">取消</button>
                <button type="button" class="btn-primary" :disabled="permSaving" @click="savePermissions">
                  {{ permSaving ? '保存中...' : '保存更改' }}
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- ========== Batch Confirm Modal ========== -->
      <Teleport to="body">
        <Transition name="overlay-fade">
          <div v-if="showBatchConfirm" class="modal-overlay" @click.self="showBatchConfirm = false">
            <div class="confirm-dialog">
              <div class="confirm-icon" :class="batchAction === 'revoke' ? 'danger' : ''">
                <svg v-if="batchAction === 'grant'" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <div class="confirm-title">{{ batchAction === 'grant' ? '批量授权确认' : '批量撤销确认' }}</div>
              <div class="confirm-message">
                <template v-if="batchAction === 'grant'">
                  确定要为选中的 <strong>{{ selectedIds.size }}</strong> 位用户授权全部 <strong>{{ allTemplates.length }}</strong> 个模板吗？
                </template>
                <template v-else>
                  确定要撤销选中的 <strong>{{ selectedIds.size }}</strong> 位用户的全部模板权限吗？此操作不可恢复。
                </template>
              </div>
              <div class="confirm-actions">
                <button class="btn-cancel" @click="showBatchConfirm = false">取消</button>
                <button :class="batchAction === 'revoke' ? 'btn-danger' : 'btn-primary'" @click="executeBatchAction">
                  确认{{ batchAction === 'grant' ? '授权' : '撤销' }}
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- ========== Tier Upgrade Modal ========== -->
      <Teleport to="body">
        <Transition name="overlay-fade">
          <div v-if="showTierModal" class="modal-overlay" @click.self="closeTierModal">
            <div class="modal-dialog tier-dialog">
              <div class="modal-header">
                <h2 class="modal-title">升级会员</h2>
                <button class="modal-close" @click="closeTierModal">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
              <div class="modal-body">
                <div class="perm-user">
                  <div class="perm-avatar">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                  <div>
                    <div class="perm-name">{{ tierTarget?.nickname || tierTarget?.username || '用户' }}</div>
                    <div class="perm-meta">
                      当前等级：<span class="tier-badge tier-badge-sm" :class="tierTarget ? getTierClass(tierTarget) : ''">{{ tierTarget ? getTierLabel(tierTarget) : '' }}</span>
                    </div>
                  </div>
                </div>

                <div v-if="tierTarget" class="upgrade-options">
                  <div
                    v-if="getActualTier(tierTarget) === 'free'"
                    class="upgrade-card"
                    :class="{ selected: tierForm.tier === 'trial' }"
                    @click="tierForm.tier = 'trial'"
                  >
                    <div class="upgrade-radio" :class="{ active: tierForm.tier === 'trial' }"></div>
                    <div>
                      <div class="upgrade-name trial">体验会员</div>
                      <div class="upgrade-desc">3天 / 10次SOP运行 / ¥9.9</div>
                    </div>
                  </div>
                  <div
                    v-if="getActualTier(tierTarget) === 'free' || getActualTier(tierTarget) === 'trial'"
                    class="upgrade-card"
                    :class="{ selected: tierForm.tier === 'standard' }"
                    @click="tierForm.tier = 'standard'"
                  >
                    <div class="upgrade-radio" :class="{ active: tierForm.tier === 'standard' }"></div>
                    <div>
                      <div class="upgrade-name standard">普通会员</div>
                      <div class="upgrade-desc">每月 20 次 SOP 运行</div>
                    </div>
                  </div>
                  <div
                    class="upgrade-card"
                    :class="{ selected: tierForm.tier === 'premium' }"
                    @click="tierForm.tier = 'premium'"
                  >
                    <div class="upgrade-radio" :class="{ active: tierForm.tier === 'premium' }"></div>
                    <div>
                      <div class="upgrade-name premium">高级会员</div>
                      <div class="upgrade-desc">无限次 SOP 运行</div>
                    </div>
                  </div>
                </div>

                <div v-if="tierForm.tier === 'trial'" class="tier-preview">
                  体验会员固定3天有效期，无需选择时长
                </div>
                <div v-if="tierForm.tier && tierForm.tier !== 'trial'" class="form-group">
                  <label class="form-label">开通时长</label>
                  <select v-model="tierForm.months" class="form-input form-select">
                    <option v-for="m in 12" :key="m" :value="m">{{ m }} 个月</option>
                  </select>
                </div>
                <div v-if="tierForm.tier && tierForm.tier !== 'trial'" class="tier-preview">
                  到期日期：<strong>{{ tierExpirePreview }}</strong>
                  <span class="tier-preview-hint">（每月按 30 天计算）</span>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn-cancel" @click="closeTierModal">取消</button>
                <button type="button" class="btn-primary" :disabled="isTierUpdating || !tierForm.tier" @click="handleTierUpgrade">
                  {{ isTierUpdating ? '升级中...' : '确认升级' }}
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- ========== Toast ========== -->
      <Teleport to="body">
        <Transition name="toast-fade">
          <div v-if="toast.visible" class="toast" :class="toast.type">
            <svg v-if="toast.type === 'success'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <svg v-else-if="toast.type === 'error'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            {{ toast.message }}
          </div>
        </Transition>
      </Teleport>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onBeforeUnmount } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import {
  fetchStatistics,
  fetchSubUsers,
  registerSubUser,
  checkUsername,
  fetchUserTemplates,
  grantTemplates,
  revokeTemplates,
  batchGrantTemplates,
  batchRevokeTemplates,
  fetchAllTemplates,
  updateSubUserTier,
  fetchUserFeatures,
  grantFeatures,
  revokeFeatures,
  type SubUser,
  type TemplateItem
} from '@/api/customers'

// ── State ──────────────────────────────────────────────────────────
const statistics = reactive({
  total_sub_users: null as number | null,
  active_sub_users: null as number | null,
  total_templates: null as number | null,
  total_runs: null as number | null
})

const allSubUsers = ref<SubUser[]>([])
const allTemplates = ref<TemplateItem[]>([])
const isLoading = ref(false)
const searchQuery = ref('')
const currentPage = ref(1)
const pageSize = 20
const selectedIds = reactive(new Set<number | string>())
const activeFilter = ref<'all' | 'free' | 'trial' | 'standard' | 'premium'>('all')

// Register
type TierValue = 'free' | 'trial' | 'standard' | 'premium'
const showRegisterModal = ref(false)
const registerForm = ref<{ username: string; password: string; nickname: string; tier: TierValue; months: number }>({ username: '', password: '', nickname: '', tier: 'free', months: 1 })
const isRegistering = ref(false)
const usernameStatus = ref<'available' | 'taken' | 'checking' | null>(null)
const registerError = ref('')

// Batch
const showBatchConfirm = ref(false)
const batchAction = ref<'grant' | 'revoke'>('grant')

// Permission
const showPermModal = ref(false)
const permTarget = ref<SubUser | null>(null)
const permLoading = ref(false)
const permSaving = ref(false)
const permSelectedIds = reactive<Record<string, boolean>>({})
const permOriginalIds = ref<Set<string>>(new Set())

// Feature permission
const featurePermissions = reactive<Record<string, boolean>>({})
const featurePermOriginal = ref<Set<string>>(new Set())

// Tier upgrade
const showTierModal = ref(false)
const tierTarget = ref<SubUser | null>(null)
const tierForm = ref({ tier: '', months: 1 })
const isTierUpdating = ref(false)

// Dropdown
const openMenuId = ref<number | string | null>(null)

// Toast
const toast = ref({ visible: false, message: '', type: 'success' as 'success' | 'error' | 'info' })
let toastTimer: ReturnType<typeof setTimeout> | null = null
let searchTimer: ReturnType<typeof setTimeout> | null = null

// ── Computed ───────────────────────────────────────────────────────
const filteredUsers = computed(() => {
  let users = allSubUsers.value
  if (activeFilter.value !== 'all') {
    users = users.filter((u) => getActualTier(u) === activeFilter.value)
  }
  const q = searchQuery.value.toLowerCase().trim()
  if (q) {
    users = users.filter((u) => {
      const nickname = (u.nickname || '').toLowerCase()
      const phone = (u.phone || '').toLowerCase()
      return nickname.includes(q) || phone.includes(q)
    })
  }
  return users
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredUsers.value.length / pageSize)))
const pageUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredUsers.value.slice(start, start + pageSize)
})

const isAllSelected = computed(() => {
  return pageUsers.value.length > 0 && pageUsers.value.every((u) => selectedIds.has(u.user_id ?? u.id))
})

const isPermAllSelected = computed(() => {
  return allTemplates.value.length > 0 && allTemplates.value.every((t) => !!permSelectedIds[String(t.id)])
})

const freeCount = computed(() => allSubUsers.value.filter((u) => getActualTier(u) === 'free').length)
const trialCount = computed(() => allSubUsers.value.filter((u) => getActualTier(u) === 'trial').length)
const standardCount = computed(() => allSubUsers.value.filter((u) => getActualTier(u) === 'standard').length)
const premiumCount = computed(() => allSubUsers.value.filter((u) => getActualTier(u) === 'premium').length)

function computeExpireDate(months: number): string {
  if (!months) return ''
  const d = new Date()
  d.setDate(d.getDate() + months * 30)
  return d.toLocaleDateString('zh-CN')
}

const tierExpirePreview = computed(() => computeExpireDate(tierForm.value.months))
const registerExpirePreview = computed(() => computeExpireDate(registerForm.value.months))

// eslint-disable-next-line no-useless-escape
const passwordRegex = /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{6,18}$/

const regFieldErrors = computed(() => {
  const f = registerForm.value
  const username = f.username.trim()
  const password = f.password
  const nickname = f.nickname.trim()
  return {
    username: username && !/^[a-zA-Z0-9]{3,20}$/.test(username) ? '用户名格式不正确（3-20位字母或数字）' : '',
    password: password && !passwordRegex.test(password) ? '密码格式不正确（6-18位字母、数字或符号）' : '',
    nickname: nickname && (nickname.length < 2 || nickname.length > 20) ? '昵称格式不正确（2-20位字符）' : ''
  }
})

const isRegFormValid = computed(() => {
  const f = registerForm.value
  const username = f.username.trim()
  const password = f.password
  const nickname = f.nickname.trim()
  return /^[a-zA-Z0-9]{3,20}$/.test(username) &&
    passwordRegex.test(password) &&
    nickname.length >= 2 && nickname.length <= 20 &&
    usernameStatus.value !== 'taken'
})

// ── Lifecycle ──────────────────────────────────────────────────────
function handleGlobalClick() { openMenuId.value = null }

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer)
  if (searchTimer) clearTimeout(searchTimer)
  document.removeEventListener('click', handleGlobalClick)
})

onMounted(async () => {
  document.addEventListener('click', handleGlobalClick)
  isLoading.value = true
  try {
    await Promise.all([loadStatistics(), loadSubUsers(), loadAllTemplates()])
  } finally {
    isLoading.value = false
  }
})

// ── API ────────────────────────────────────────────────────────────
async function loadStatistics() {
  try {
    const res = await fetchStatistics()
    if (res.code === 200 || res.code === 0) {
      const d = (res.data || {}) as Record<string, any>
      statistics.total_sub_users = d.total_sub_users ?? 0
      statistics.active_sub_users = d.active_sub_users ?? 0
      statistics.total_templates = d.total_templates_count ?? d.total_templates ?? 0
      statistics.total_runs = 0
    }
  } catch (e) { console.error('加载统计数据失败:', e) }
}

async function loadSubUsers() {
  try {
    const res = await fetchSubUsers(0, 1000)
    if (res.code === 200 || res.code === 0) {
      const d = res.data as any
      allSubUsers.value = Array.isArray(d) ? d : d?.sub_users || []
      statistics.total_runs = allSubUsers.value.reduce((sum, u) => sum + (u.total_sop_runs || 0), 0)
    }
  } catch (e) { console.error('加载子用户列表失败:', e) }
}

async function loadAllTemplates() {
  try {
    const res = await fetchAllTemplates()
    if (res.code === 200 || res.code === 0) {
      const td = res.data as any
      const raw: any[] = Array.isArray(td) ? td : td?.templates || []
      allTemplates.value = raw.map((t) => ({ ...t, id: t.id ?? t.ID, name: t.name || '' }))
    }
  } catch (e) { console.error('加载模板列表失败:', e) }
}

// ── Search & Filter ────────────────────────────────────────────────
function handleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { currentPage.value = 1 }, 300)
}

function setFilter(f: 'all' | 'free' | 'trial' | 'standard' | 'premium') {
  activeFilter.value = f
  currentPage.value = 1
}

// ── Selection ──────────────────────────────────────────────────────
function toggleSelect(id: number | string) {
  if (selectedIds.has(id)) { selectedIds.delete(id) } else { selectedIds.add(id) }
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    pageUsers.value.forEach((u) => selectedIds.delete(u.user_id ?? u.id))
  } else {
    pageUsers.value.forEach((u) => selectedIds.add(u.user_id ?? u.id))
  }
}

// ── Register ───────────────────────────────────────────────────────
function closeRegisterModal() {
  showRegisterModal.value = false
  registerForm.value = { username: '', password: '', nickname: '', tier: 'free' as TierValue, months: 1 }
  usernameStatus.value = null
  registerError.value = ''
}

async function checkUsernameAvailability() {
  const name = registerForm.value.username.trim()
  if (!name) { usernameStatus.value = null; return }
  usernameStatus.value = 'checking'
  try {
    const res = await checkUsername(name)
    usernameStatus.value = (res.code === 200 || res.code === 0) && res.data?.available ? 'available' : 'taken'
  } catch { usernameStatus.value = 'taken' }
}

function validateRegisterForm(): string | null {
  const { username: u, password: p, nickname: n, tier, months } = registerForm.value
  if (!/^[a-zA-Z0-9]{3,20}$/.test(u.trim())) return '用户名需要3-20位字母数字'
  if (p.length < 6 || p.length > 18) return '密码需要6-18位'
  if (!n.trim() || n.trim().length < 2 || n.trim().length > 20) return '昵称需要2-20位'
  if (tier !== 'free') {
    if (!['trial', 'standard', 'premium'].includes(tier)) return '无效的会员等级'
    if (tier !== 'trial' && (!months || months < 1 || months > 12)) return '开通时长需要1-12个月'
  }
  return null
}

async function handleRegister() {
  const error = validateRegisterForm()
  if (error) { registerError.value = error; return }
  if (usernameStatus.value === 'taken') { registerError.value = '用户名已被使用'; return }
  registerError.value = ''
  isRegistering.value = true
  try {
    const payload: Parameters<typeof registerSubUser>[0] = {
      username: registerForm.value.username.trim(),
      password: registerForm.value.password,
      nickname: registerForm.value.nickname.trim() || undefined
    }
    if (registerForm.value.tier !== 'free') {
      payload.tier = registerForm.value.tier
      payload.months = registerForm.value.months
    }
    const res = await registerSubUser(payload)
    if (res.code === 200 || res.code === 0) {
      showToast('注册成功', 'success')
      closeRegisterModal()
      await loadSubUsers()
      await loadStatistics()
    }
  } catch (e: unknown) {
    registerError.value = e instanceof Error ? e.message : '注册失败'
  } finally { isRegistering.value = false }
}

// ── Permission ─────────────────────────────────────────────────────
async function openPermissionModal(user: SubUser) {
  permTarget.value = user
  showPermModal.value = true
  permLoading.value = true
  Object.keys(permSelectedIds).forEach((k) => delete permSelectedIds[k])
  permOriginalIds.value = new Set()
  const userId = user.user_id ?? user.id
  try {
    const [templateRes, featureRes] = await Promise.all([
      fetchUserTemplates(userId).catch((e) => { console.error('加载授权模板失败:', e); return null }),
      fetchUserFeatures(userId).catch((e) => { console.error('加载功能权限失败:', e); return null })
    ])
    if (templateRes && (templateRes.code === 200 || templateRes.code === 0)) {
      const d = templateRes.data as Record<string, unknown> | unknown[]
      const rawAuth = (Array.isArray(d) ? d : (d as Record<string, unknown>)?.templates || []) as Array<Record<string, unknown>>
      rawAuth.forEach((t) => { const id = String(t.id ?? t.ID); permSelectedIds[id] = true; permOriginalIds.value.add(id) })
    }
    if (featureRes && (featureRes.code === 200 || featureRes.code === 0)) {
      const features = (featureRes.data as any)?.features || []
      if (Array.isArray(features)) { features.forEach((f: string) => { featurePermissions[f] = true; featurePermOriginal.value.add(f) }) }
    }
  } finally { permLoading.value = false }
}

function closePermissionModal() {
  showPermModal.value = false
  permTarget.value = null
  permLoading.value = false
  permSaving.value = false
  Object.keys(permSelectedIds).forEach((k) => delete permSelectedIds[k])
  Object.keys(featurePermissions).forEach((k) => delete featurePermissions[k])
  featurePermOriginal.value = new Set()
}

function togglePermTemplate(id: string) {
  if (permSelectedIds[id]) { delete permSelectedIds[id] } else { permSelectedIds[id] = true }
}

function togglePermSelectAll() {
  if (isPermAllSelected.value) {
    allTemplates.value.forEach((t) => delete permSelectedIds[String(t.id)])
  } else {
    allTemplates.value.forEach((t) => { permSelectedIds[String(t.id)] = true })
  }
}

async function savePermissions() {
  if (!permTarget.value) return
  const userId = permTarget.value.user_id ?? permTarget.value.id
  permSaving.value = true
  try {
    const featuresToGrant: string[] = []
    const featuresToRevoke: string[] = []
    Object.keys(featurePermissions).forEach((key) => { if (!featurePermOriginal.value.has(key)) featuresToGrant.push(key) })
    featurePermOriginal.value.forEach((key) => { if (!featurePermissions[key]) featuresToRevoke.push(key) })
    if (featuresToGrant.length > 0) await grantFeatures(userId, featuresToGrant)
    if (featuresToRevoke.length > 0) await revokeFeatures(userId, featuresToRevoke)

    const toGrant: string[] = []
    const toRevoke: string[] = []
    Object.keys(permSelectedIds).forEach((id) => { if (!permOriginalIds.value.has(id)) toGrant.push(id) })
    permOriginalIds.value.forEach((id) => { if (!permSelectedIds[id]) toRevoke.push(id) })

    if (toGrant.length === 0 && toRevoke.length === 0 && featuresToGrant.length === 0 && featuresToRevoke.length === 0) {
      showToast('没有变更', 'info'); closePermissionModal(); return
    }
    if (toGrant.length > 0) await grantTemplates(userId, toGrant.map(Number))
    if (toRevoke.length > 0) await revokeTemplates(userId, toRevoke.map(Number))
    showToast('权限已更新', 'success')
    closePermissionModal()
    await loadSubUsers()
  } catch (e: unknown) {
    showToast(`保存失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error')
  } finally { permSaving.value = false }
}

// ── Batch ──────────────────────────────────────────────────────────
function batchGrant() {
  if (allTemplates.value.length === 0) { showToast('没有可用模板', 'info'); return }
  batchAction.value = 'grant'; showBatchConfirm.value = true
}

function batchRevoke() { batchAction.value = 'revoke'; showBatchConfirm.value = true }

async function executeBatchAction() {
  showBatchConfirm.value = false
  const userIds = Array.from(selectedIds)
  const templateIds = allTemplates.value.map((t) => t.id)
  try {
    if (batchAction.value === 'grant') {
      await batchGrantTemplates({ user_ids: userIds, template_ids: templateIds })
      showToast('批量授权成功', 'success')
    } else {
      await batchRevokeTemplates({ user_ids: userIds, template_ids: templateIds })
      showToast('批量撤销成功', 'success')
    }
    selectedIds.clear()
    await loadSubUsers()
  } catch (e: unknown) { showToast(`批量操作失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error') }
}

// ── Helpers ────────────────────────────────────────────────────────
function getActualTier(user: SubUser): string {
  const tier = user.user_tier || 'free'
  const isExpired = user.tier_expires && new Date(user.tier_expires) < new Date()
  return (isExpired || tier === 'free') ? 'free' : tier
}

function getTierClass(user: SubUser) {
  const t = getActualTier(user)
  if (t === 'premium') return 'tier-premium'
  if (t === 'standard') return 'tier-standard'
  if (t === 'trial') return 'tier-trial'
  return 'tier-free'
}

function getTierLabel(user: SubUser) {
  const tier = user.user_tier || 'free'
  const isExpired = user.tier_expires && new Date(user.tier_expires) < new Date()
  if (isExpired || tier === 'free') return '免费用户'
  if (tier === 'trial') return '体验会员'
  if (tier === 'premium') return '高级会员'
  if (tier === 'standard') return '普通会员'
  return '免费用户'
}

function canUpgrade(user: SubUser): boolean { return getActualTier(user) !== 'premium' }

function formatDate(dateStr: string) { return new Date(dateStr).toLocaleDateString('zh-CN') }

function showToast(message: string, type: 'success' | 'error' | 'info' = 'success', duration = 3000) {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = { visible: true, message, type }
  toastTimer = setTimeout(() => { toast.value.visible = false }, duration)
}

// ── Action Dropdown ───────────────────────────────────────────────
function toggleActionMenu(id: number | string) { openMenuId.value = openMenuId.value === id ? null : id }
function handleMenuPermission(user: SubUser) { openMenuId.value = null; openPermissionModal(user) }
function handleMenuUpgrade(user: SubUser) { if (!canUpgrade(user)) return; openMenuId.value = null; openTierModal(user) }

// ── Tier Upgrade ──────────────────────────────────────────────────
function openTierModal(user: SubUser) {
  tierTarget.value = user
  const actual = getActualTier(user)
  let defaultTier = 'premium'
  if (actual === 'free') defaultTier = 'trial'
  else if (actual === 'trial') defaultTier = 'standard'
  tierForm.value = { tier: defaultTier, months: 1 }
  showTierModal.value = true
}

function closeTierModal() { showTierModal.value = false; tierTarget.value = null; tierForm.value = { tier: '', months: 1 } }

async function handleTierUpgrade() {
  if (!tierTarget.value || !tierForm.value.tier) return
  const userId = tierTarget.value.user_id ?? tierTarget.value.id
  isTierUpdating.value = true
  try {
    const res = await updateSubUserTier(userId, { tier: tierForm.value.tier, months: tierForm.value.months })
    if (res.code === 200 || res.code === 0) { showToast('升级成功', 'success'); closeTierModal(); await loadSubUsers() }
  } catch (e: unknown) {
    showToast(`升级失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error')
  } finally { isTierUpdating.value = false }
}
</script>

<style scoped>
.customers-page {
  max-width: 1200px;
  margin: 0 auto;
  padding-bottom: 100px;
}

/* ===== Hero ===== */
.hero-section {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 28px;
  padding: 20px 0 0;
}

.hero-content { flex: 1; }

.hero-title {
  font-family: var(--font-sans);
  font-size: 36px;
  font-weight: 700;
  color: hsl(155, 30%, 15%);
  line-height: 1.3;
  letter-spacing: -0.02em;
  margin: 0 0 6px;
}

.hero-subtitle {
  font-size: 15px;
  color: hsl(158, 20%, 45%);
  margin: 0;
}

.hero-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 22px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
  box-shadow: 0 4px 16px hsl(158 64% 50% / 0.25);
}

.hero-action-btn:hover {
  background: var(--accent-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px hsl(158 64% 50% / 0.3);
}

/* ===== Stats Grid ===== */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 28px;
}

.stat-card {
  display: flex;
  align-items: baseline;
  gap: 2px;
  padding: 16px 20px;
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: 16px;
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3),
    inset 0 1px 0 0 hsla(0, 0%, 100%, 0.6);
}

.stat-label {
  font-size: 14px;
  color: hsl(155, 25%, 18%);
  white-space: nowrap;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: hsl(155, 25%, 18%);
}

/* ===== Toolbar ===== */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 12px;
  flex-wrap: wrap;
}

/* ===== Filter Bar ===== */
.filter-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  color: hsl(155, 12%, 45%);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3),
    inset 0 1px 0 0 hsla(0, 0%, 100%, 0.6);
  user-select: none;
}

.filter-btn:hover {
  transform: translateY(-1px);
  border-color: hsl(158, 40%, 82%);
  color: hsl(155, 25%, 30%);
}

.filter-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  box-shadow: 0 4px 16px hsl(158 64% 50% / 0.3);
}

.filter-btn.active .filter-count { background: hsla(0, 0%, 100%, 0.25); color: #fff; }
.filter-btn.active .filter-dot { background: #fff; box-shadow: none; }

.filter-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.filter-dot.free { background: hsl(0, 0%, 65%); }
.filter-dot.trial { background: hsl(217, 71%, 53%); }
.filter-dot.standard { background: hsl(158, 64%, 45%); }
.filter-dot.premium { background: hsl(45, 90%, 50%); box-shadow: 0 0 5px hsl(45 90% 50% / 0.4); }

.filter-count {
  padding: 1px 7px;
  border-radius: 6px;
  background: hsl(150, 15%, 93%);
  font-size: 11px;
  font-weight: 600;
  color: hsl(155, 15%, 45%);
  min-width: 18px;
  text-align: center;
  transition: all 0.2s;
}

/* ===== Search ===== */
.search-box { position: relative; display: flex; align-items: center; }

.search-icon {
  position: absolute;
  left: 12px;
  color: hsl(155, 12%, 55%);
  pointer-events: none;
}

.search-input {
  width: 220px;
  height: 36px;
  padding: 0 12px 0 36px;
  border-radius: var(--radius-md);
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  font-size: 13px;
  color: hsl(155, 25%, 18%);
  outline: none;
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
  box-shadow: 0 2px 12px hsl(150 15% 0% / 0.05), 0 0 0 1px hsl(155 20% 92% / 0.3);
}

.search-input:focus {
  border-color: hsl(158, 64%, 50%);
  box-shadow: 0 0 0 3px hsl(158 50% 50% / 0.12);
}

/* ===== Table ===== */
.table-container {
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: 20px;
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3),
    inset 0 1px 0 0 hsla(0, 0%, 100%, 0.6);
  overflow: hidden;
}

.table-scroll { overflow-x: auto; }

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.data-table th {
  text-align: center;
  padding: 14px 16px;
  font-size: 12px;
  font-weight: 600;
  color: hsl(155, 15%, 50%);
  letter-spacing: 0.04em;
  border-bottom: 1px solid hsl(155, 20%, 93%);
  white-space: nowrap;
  background: hsla(150, 15%, 98%, 0.5);
}

.data-table td {
  padding: 14px 16px;
  border-bottom: 1px solid hsl(155, 20%, 95%);
  color: hsl(155, 15%, 25%);
  vertical-align: middle;
  text-align: center;
}

.data-table tbody tr { transition: background 0.15s; }
.data-table tbody tr:last-child td { border-bottom: none; }
.data-table tbody tr:hover td { background: hsl(155, 20%, 98%); }
.data-table tbody tr.row-selected td { background: hsl(158, 50%, 97%); }

.col-check { width: 48px; text-align: center; }
.col-check .checkbox-mark { margin: 0 auto; }
.col-user { min-width: 160px; }
.col-action { width: 100px; text-align: center; }

/* Checkbox */
.checkbox-mark {
  width: 20px;
  height: 20px;
  border: 2px solid hsl(155, 20%, 82%);
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  background: hsla(0, 0%, 100%, 0.8);
  color: transparent;
}

.checkbox-mark.checked {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

/* User info cell */
.user-info { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.user-name { font-weight: 600; color: hsl(155, 25%, 18%); }
.user-meta { font-size: 12px; color: hsl(155, 12%, 55%); }

/* Tier badge */
.tier-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.tier-badge-sm { font-size: 11px; padding: 2px 8px; }

.tier-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.tier-free { background: hsl(0, 0%, 93%); color: hsl(150, 10%, 45%); }
.tier-trial { background: hsl(217, 91%, 95%); color: hsl(217, 71%, 45%); }
.tier-standard { background: hsl(158, 50%, 93%); color: hsl(158, 64%, 32%); }
.tier-premium { background: hsl(45, 90%, 94%); color: hsl(35, 80%, 35%); }

.cell-secondary { font-size: 13px; color: hsl(155, 12%, 50%); }
.cell-metric { font-size: 14px; font-weight: 600; color: hsl(155, 25%, 22%); }

/* Action dropdown */
.action-dropdown { position: relative; display: inline-flex; justify-content: center; }

.action-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: 10px;
  border: 1px solid hsl(155, 20%, 88%);
  background: hsla(0, 0%, 100%, 0.8);
  font-size: 13px;
  color: var(--accent);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.action-trigger:hover {
  background: hsl(158, 50%, 96%);
  border-color: hsl(158, 64%, 50%);
}

.action-menu {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 4px;
  min-width: 140px;
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.97), hsla(150, 12%, 98%, 0.94));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: 12px;
  box-shadow: 0 8px 24px hsl(150 10% 0% / 0.10), 0 0 0 1px hsl(155 20% 92% / 0.3);
  z-index: 200;
  padding: 4px;
  animation: menu-pop 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes menu-pop {
  from { opacity: 0; transform: scale(0.95) translateY(-4px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.action-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  font-size: 13px;
  color: hsl(155, 12%, 25%);
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s;
  white-space: nowrap;
}

.action-menu-item:hover:not(.disabled) { background: hsl(155, 20%, 95%); color: var(--accent); }
.action-menu-item.disabled { opacity: 0.4; cursor: not-allowed; }

/* ===== Pagination ===== */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px 0;
}

.page-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid hsl(155, 20%, 90%);
  background: transparent;
  font-size: 13px;
  color: hsl(155, 12%, 40%);
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) { background: hsl(155, 20%, 96%); color: var(--accent); }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-info { font-size: 13px; color: hsl(155, 12%, 50%); font-weight: 500; }

/* ===== Loading ===== */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120px 20px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid hsl(155, 30%, 90%);
  border-top-color: hsl(158, 64%, 45%);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin { to { transform: rotate(360deg); } }
.loading-text { font-size: 14px; color: var(--text-secondary); }

/* ===== Empty ===== */
.empty-state { text-align: center; padding: 80px 20px; }
.empty-state.compact { padding: 48px 20px; }

.empty-icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 24px;
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  margin-bottom: 20px;
  box-shadow: 0 4px 16px hsl(150 15% 0% / 0.06);
}

.empty-icon { width: 36px; height: 36px; color: hsl(158, 30%, 65%); }
.empty-title { font-weight: 650; font-size: 18px; color: hsl(155, 25%, 18%); margin-bottom: 6px; }
.empty-desc { font-size: 14px; color: hsl(155, 12%, 50%); margin-bottom: 24px; }

.empty-action {
  display: inline-flex;
  align-items: center;
  padding: 10px 28px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
  box-shadow: 0 4px 12px hsl(158 64% 50% / 0.25);
}

.empty-action:hover {
  background: var(--accent-hover);
  transform: translateY(-2px);
}

/* ===== Manage Bar ===== */
.manage-bar {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 28px;
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.92));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: 20px;
  box-shadow: 0 12px 40px hsl(150 15% 0% / 0.12), 0 0 0 1px hsl(155 20% 92% / 0.3);
  z-index: 100;
}

.manage-count { font-size: 14px; font-weight: 600; color: hsl(155, 25%, 18%); }

.manage-select-all {
  padding: 7px 16px;
  border-radius: var(--radius-md);
  border: 1px solid hsl(155, 20%, 88%);
  background: hsla(0, 0%, 100%, 0.8);
  color: hsl(155, 12%, 45%);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.manage-select-all:hover { border-color: var(--accent); color: var(--accent); }

.manage-btn-grant {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px hsl(158 64% 50% / 0.25);
}

.manage-btn-grant:hover { background: var(--accent-hover); }

.manage-btn-revoke {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: var(--radius-md);
  border: none;
  background: hsl(0, 72%, 56%);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px hsl(0 72% 56% / 0.25);
}

.manage-btn-revoke:hover { background: hsl(0, 72%, 48%); }

.bar-slide-enter-active, .bar-slide-leave-active { transition: all 0.3s cubic-bezier(0.2, 0, 0, 1); }
.bar-slide-enter-from { opacity: 0; transform: translateX(-50%) translateY(20px); }
.bar-slide-leave-to { opacity: 0; transform: translateX(-50%) translateY(20px); }

/* ===== Modal Shared ===== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.overlay-fade-enter-active, .overlay-fade-leave-active { transition: opacity 0.2s ease; }
.overlay-fade-enter-from, .overlay-fade-leave-to { opacity: 0; }

.modal-dialog {
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.97), hsla(150, 12%, 98%, 0.94));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: 20px;
  width: 90%;
  max-width: 520px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.18), 0 0 0 1px hsl(155 20% 92% / 0.3);
  animation: dialog-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes dialog-pop {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid hsl(155, 20%, 93%);
}

.modal-title { font-size: 18px; font-weight: 700; color: hsl(155, 25%, 18%); margin: 0; }

.modal-close {
  background: transparent;
  border: none;
  cursor: pointer;
  color: hsl(155, 12%, 55%);
  padding: 4px;
  border-radius: 8px;
  transition: all 0.2s;
}

.modal-close:hover { color: hsl(155, 25%, 25%); background: hsl(155, 20%, 94%); }

.modal-body { padding: 24px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 0 24px 24px; }

/* Confirm Dialog */
.confirm-dialog {
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.97), hsla(150, 12%, 98%, 0.94));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: 20px;
  padding: 36px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.18), 0 0 0 1px hsl(155 20% 92% / 0.3);
  animation: dialog-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.confirm-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: hsl(158, 50%, 93%);
  color: hsl(158, 64%, 40%);
  margin-bottom: 16px;
}

.confirm-icon.danger { background: hsl(0, 80%, 96%); color: hsl(0, 70%, 55%); }
.confirm-title { font-size: 18px; font-weight: 700; color: hsl(155, 25%, 18%); margin-bottom: 8px; }
.confirm-message { font-size: 14px; color: hsl(155, 12%, 45%); line-height: 1.5; margin-bottom: 24px; }
.confirm-actions { display: flex; gap: 12px; width: 100%; }

/* ===== Form ===== */
.form-group { margin-bottom: 20px; }
.form-group--compact { margin-bottom: 12px; }

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: hsl(155, 15%, 25%);
  margin-bottom: 8px;
}

.required { color: #ef4444; }

.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid hsl(155, 20%, 88%);
  border-radius: 12px;
  font-size: 14px;
  color: hsl(155, 25%, 18%);
  background: hsla(0, 0%, 100%, 0.8);
  outline: none;
  transition: all 0.2s;
  box-sizing: border-box;
}

.form-input:focus { border-color: hsl(158, 64%, 50%); box-shadow: 0 0 0 3px hsl(158 50% 50% / 0.12); background: #fff; }
.form-input.input-error { border-color: #ef4444; }
.form-input.input-error:focus { border-color: #ef4444; box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1); }
.form-select { appearance: auto; cursor: pointer; }

.input-row { display: flex; gap: 8px; }
.input-row .form-input { flex: 1; min-width: 0; }

.btn-inline {
  flex-shrink: 0;
  padding: 0 16px;
  border: 1px solid hsl(158, 30%, 80%);
  border-radius: 12px;
  background: hsla(158, 40%, 96%, 0.8);
  color: hsl(158, 64%, 35%);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-inline:hover:not(:disabled) { background: hsl(158, 50%, 92%); border-color: hsl(158, 64%, 50%); }
.btn-inline:disabled { opacity: 0.5; cursor: not-allowed; }

.field-error { margin-top: 6px; font-size: 12px; color: #ef4444; }
.field-hint { margin-top: 6px; font-size: 12px; }
.field-hint.available { color: hsl(158, 64%, 40%); }
.field-hint.taken { color: #ef4444; }

.form-error {
  color: #ef4444;
  font-size: 13px;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.06);
  border-radius: 10px;
  border-left: 3px solid #ef4444;
}

/* Buttons */
.btn-cancel {
  flex: 1;
  padding: 10px 20px;
  border-radius: 12px;
  border: 1px solid hsl(155, 20%, 88%);
  background: hsla(0, 0%, 100%, 0.8);
  color: hsl(155, 12%, 45%);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover { background: hsl(150, 15%, 95%); }

.btn-primary {
  flex: 1;
  padding: 10px 20px;
  border-radius: 12px;
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 10px hsl(158 64% 45% / 0.25);
}

.btn-primary:hover:not(:disabled) { background: var(--accent-hover); box-shadow: 0 4px 16px hsl(158 64% 45% / 0.35); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-danger {
  flex: 1;
  padding: 10px 20px;
  border-radius: 12px;
  border: none;
  background: hsl(0, 72%, 56%);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px hsl(0 72% 56% / 0.2);
}

.btn-danger:hover { background: hsl(0, 72%, 48%); }

/* ===== Tier Section (Register) ===== */
.tier-section { margin-bottom: 20px; }

.tier-divider {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.tier-divider::before, .tier-divider::after { content: ''; flex: 1; height: 1px; background: hsl(155, 20%, 92%); }
.tier-divider span { padding: 0 12px; font-size: 12px; color: hsl(155, 12%, 50%); white-space: nowrap; }

.tier-toggle {
  display: flex;
  margin-bottom: 16px;
  border: 1px solid hsl(155, 20%, 88%);
  border-radius: 12px;
  overflow: hidden;
}

.tier-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: hsl(155, 12%, 45%);
  background: hsla(0, 0%, 100%, 0.6);
  transition: all 0.2s;
  border-right: 1px solid hsl(155, 20%, 88%);
}

.tier-option:last-child { border-right: none; }
.tier-option input { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
.tier-option.active { background: hsl(158, 50%, 95%); color: hsl(158, 64%, 35%); font-weight: 600; }

.tier-detail { animation: fadeSlideDown 0.2s ease-out; }

@keyframes fadeSlideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.tier-preview {
  padding: 12px 16px;
  background: hsl(155, 20%, 97%);
  border-radius: 12px;
  font-size: 14px;
  color: hsl(155, 12%, 40%);
}

.tier-preview strong { color: hsl(155, 25%, 18%); }
.tier-preview-hint { font-size: 12px; color: hsl(155, 12%, 55%); }

/* ===== Permission Modal ===== */
.perm-dialog { max-width: 560px; max-height: 80vh; display: flex; flex-direction: column; }
.perm-body { overflow-y: auto; flex: 1; }
.perm-loading { padding: 32px; display: flex; justify-content: center; }

.perm-user {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid hsl(155, 20%, 93%);
}

.perm-avatar {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: hsl(158, 40%, 94%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: hsl(158, 64%, 40%);
  flex-shrink: 0;
}

.perm-name { font-size: 16px; font-weight: 700; color: hsl(155, 25%, 18%); }
.perm-meta { font-size: 13px; color: hsl(155, 12%, 50%); margin-top: 2px; }

.perm-group { margin-bottom: 20px; }

.perm-group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: hsl(155, 15%, 25%);
  margin-bottom: 12px;
}

.perm-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background: hsl(155, 15%, 93%);
  color: hsl(155, 12%, 45%);
}

.perm-toggle-all {
  margin-left: auto;
  padding: 4px 12px;
  border-radius: 8px;
  border: 1px solid hsl(155, 20%, 88%);
  background: hsla(0, 0%, 100%, 0.8);
  font-size: 12px;
  color: var(--accent);
  cursor: pointer;
  transition: all 0.2s;
}

.perm-toggle-all:hover { background: hsl(158, 50%, 95%); border-color: hsl(158, 64%, 50%); }

.perm-list { display: flex; flex-direction: column; gap: 8px; max-height: 300px; overflow-y: auto; }

.perm-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid hsl(155, 20%, 93%);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.perm-item:hover { background: hsl(155, 20%, 98%); }
.perm-item.checked { background: hsl(158, 50%, 97%); border-color: hsl(158, 40%, 80%); }
.perm-item-label { font-size: 14px; color: hsl(155, 12%, 20%); }

/* ===== Tier Upgrade Modal ===== */
.tier-dialog { max-width: 480px; }

.upgrade-options { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }

.upgrade-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 2px solid hsl(155, 20%, 90%);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.upgrade-card:hover { border-color: hsl(155, 20%, 80%); }
.upgrade-card.selected { border-color: hsl(158, 64%, 50%); background: hsl(158, 50%, 97%); }

.upgrade-radio {
  width: 18px;
  height: 18px;
  border: 2px solid hsl(155, 15%, 75%);
  border-radius: 50%;
  flex-shrink: 0;
  position: relative;
  transition: all 0.2s;
}

.upgrade-radio.active { border-color: hsl(158, 64%, 45%); }

.upgrade-radio.active::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: hsl(158, 64%, 45%);
}

.upgrade-name { font-size: 15px; font-weight: 600; margin-bottom: 2px; }
.upgrade-name.trial { color: hsl(217, 71%, 45%); }
.upgrade-name.standard { color: hsl(158, 64%, 35%); }
.upgrade-name.premium { color: hsl(45, 100%, 40%); }
.upgrade-desc { font-size: 13px; color: hsl(155, 12%, 50%); }

/* ===== Toast ===== */
.toast {
  position: fixed;
  top: 32px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  z-index: 10001;
  pointer-events: none;
  box-shadow: 0 8px 24px hsl(0 0% 0% / 0.12);
}

.toast.success { background: hsl(155, 30%, 18%); color: hsl(158, 50%, 85%); }
.toast.error { background: hsl(0, 80%, 96%); color: hsl(0, 70%, 45%); border: 1px solid hsl(0, 70%, 90%); }
.toast.info { background: hsl(155, 30%, 18%); color: hsl(158, 50%, 85%); }

.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.toast-fade-enter-from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
.toast-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px); }

/* ===== Responsive ===== */
@media (max-width: 1100px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 768px) {
  .hero-section { flex-direction: column; gap: 12px; }
  .hero-title { font-size: 24px; }

  .toolbar { flex-direction: column; align-items: stretch; gap: 10px; }
  .filter-bar { gap: 4px; flex-wrap: wrap; }
  .filter-btn { padding: 7px 10px; font-size: 12px; }
  .search-box { width: 100%; }
  .search-input { width: 100%; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }

  .table-container { border-radius: 14px; }
  .data-table { font-size: 13px; }
  .data-table th { padding: 10px 12px; font-size: 11px; }
  .data-table td { padding: 10px 12px; }

  .manage-bar {
    left: 12px;
    right: 12px;
    bottom: calc(var(--mobile-tab-bar-height, 64px) + 8px);
    transform: none;
    width: auto;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }

  .bar-slide-enter-from, .bar-slide-leave-to { transform: translateY(20px); }
}
</style>
