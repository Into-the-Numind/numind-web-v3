<template>
  <MainLayout>
    <div class="customers-page">
      <!-- Page Header -->
      <div class="cm-page-header">
        <h1 class="cm-title">客户管理</h1>
        <p class="cm-subtitle">管理您的子用户及其模板权限</p>
      </div>

      <!-- Stats Grid -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon stat-icon-users">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ statistics.total_sub_users ?? '-' }}</div>
            <div class="stat-label">总子用户数</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon stat-icon-active">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ statistics.active_sub_users ?? '-' }}</div>
            <div class="stat-label">活跃子用户</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon stat-icon-template">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ statistics.total_templates ?? '-' }}</div>
            <div class="stat-label">可用模板数</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon stat-icon-runs">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ statistics.total_runs ?? '-' }}</div>
            <div class="stat-label">总运行次数</div>
          </div>
        </div>
      </div>

      <!-- Sub-users Section -->
      <div class="subusers-section">
        <div class="section-header">
          <h2 class="section-title">子用户列表</h2>
          <div class="section-actions">
            <div class="cm-search-box">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cm-search-icon"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input
                v-model="searchQuery"
                type="text"
                class="cm-search-input"
                placeholder="搜索用户昵称或手机号..."
                @input="handleSearch"
              />
            </div>
            <button class="btn-primary cm-register-btn" @click="showRegisterModal = true">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
              <span>注册新用户</span>
            </button>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="cm-loading">
          <div class="loading-spinner"></div>
          <p>加载中...</p>
        </div>

        <!-- Empty -->
        <div v-else-if="filteredUsers.length === 0" class="cm-empty">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <h3>暂无子用户</h3>
          <p>您还没有任何子用户</p>
        </div>

        <!-- Table -->
        <div v-else class="cm-table-wrap">
          <table class="cm-table">
            <thead>
              <tr>
                <th class="th-checkbox">
                  <div
                    class="custom-checkbox"
                    :class="{ checked: isAllSelected }"
                    @click="toggleSelectAll"
                  >
                    <svg v-if="isAllSelected" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                </th>
                <th>用户信息</th>
                <th>用户等级</th>
                <th>到期时间</th>
                <th>已授权模板</th>
                <th>总运行次数</th>
                <th>本月运行</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="user in pageUsers"
                :key="user.id || user.user_id"
                :class="{ 'selected-row': selectedIds.has(user.user_id ?? user.id) }"
              >
                <td class="td-checkbox">
                  <div
                    class="custom-checkbox"
                    :class="{ checked: selectedIds.has(user.user_id ?? user.id) }"
                    @click="toggleSelect(user.user_id ?? user.id)"
                  >
                    <svg v-if="selectedIds.has(user.user_id ?? user.id)" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                </td>
                <td>
                  <div class="user-info-cell">
                    <div class="user-name-text">{{ user.nickname || '未命名用户' }}</div>
                    <div class="user-meta-text">{{ user.phone || ('ID: ' + (user.user_id ?? user.id)) }}</div>
                  </div>
                </td>
                <td>
                  <span class="tier-badge" :class="getTierClass(user)">{{ getTierLabel(user) }}</span>
                </td>
                <td>
                  <span class="date-text">{{ user.tier_expires ? formatDate(user.tier_expires) : '-' }}</span>
                </td>
                <td>
                  <span class="template-count-badge">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
                    {{ user.authorized_templates || user.template_count || 0 }} 个模板
                  </span>
                </td>
                <td><span class="runs-count">{{ user.total_sop_runs || 0 }}</span></td>
                <td><span class="runs-count">{{ user.monthly_sop_runs || 0 }}</span></td>
                <td>
                  <div class="action-dropdown">
                    <button
                      class="action-btn"
                      aria-haspopup="true"
                      :aria-expanded="openMenuId === (user.user_id ?? user.id)"
                      @click.stop="toggleActionMenu(user.user_id ?? user.id)"
                      @keydown.escape="openMenuId = null"
                    >
                      管理
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </button>
                    <div v-if="openMenuId === (user.user_id ?? user.id)" class="action-menu" role="menu">
                      <button class="action-menu-item" role="menuitem" @click="handleMenuPermission(user)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg>
                        管理权限
                      </button>
                      <button
                        class="action-menu-item"
                        role="menuitem"
                        :class="{ disabled: !canUpgrade(user) }"
                        :disabled="!canUpgrade(user)"
                        @click="handleMenuUpgrade(user)"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                        升级等级
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Pagination -->
          <div class="cm-pagination">
            <button class="pagination-btn" :disabled="currentPage <= 1" @click="currentPage--">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              上一页
            </button>
            <div class="pagination-info">
              第 {{ currentPage }} 页，共 {{ totalPages }} 页
            </div>
            <button class="pagination-btn" :disabled="currentPage >= totalPages" @click="currentPage++">
              下一页
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        </div>

        <!-- Batch Action Bar -->
        <Transition name="batch-bar">
          <div v-if="selectedIds.size > 0" class="batch-action-bar">
            <span class="batch-count">已选 {{ selectedIds.size }} 项</span>
            <button class="batch-btn batch-grant" @click="batchGrant">批量授权</button>
            <button class="batch-btn batch-revoke" @click="batchRevoke">批量撤销</button>
          </div>
        </Transition>
      </div>

      <!-- ========== Register Modal ========== -->
      <Teleport to="body">
        <div v-if="showRegisterModal" class="modal-overlay" @click.self="closeRegisterModal">
          <div class="modal-card register-modal">
            <div class="modal-header">
              <h2>注册新用户</h2>
              <button class="modal-close" @click="closeRegisterModal">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <form id="register-form" class="modal-body" @submit.prevent="handleRegister">
              <div class="form-group">
                <label class="form-label">用户名（用于登录）<span class="required">*</span></label>
                <input v-model="registerForm.username" type="text" class="form-input" :class="{ 'input-error': regFieldErrors.username }" placeholder="3-20位字母及数字" maxlength="20" required @blur="checkUsernameAvailability" />
                <div v-if="regFieldErrors.username" class="field-error">{{ regFieldErrors.username }}</div>
                <div v-else-if="usernameStatus" class="username-hint" :class="usernameStatus">
                  {{ usernameStatus === 'available' ? '用户名可用' : usernameStatus === 'taken' ? '用户名已被使用' : '检查中...' }}
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
              <div class="reg-tier-section">
                <div class="reg-tier-divider">
                  <span class="reg-tier-divider-text">会员设置（可选）</span>
                </div>
                <div class="reg-tier-radios">
                  <label class="reg-tier-radio" :class="{ active: registerForm.tier === 'standard' }">
                    <input v-model="registerForm.tier" type="radio" name="register-tier" value="standard" />
                    <span>普通会员</span>
                  </label>
                  <label class="reg-tier-radio" :class="{ active: registerForm.tier === 'premium' }">
                    <input v-model="registerForm.tier" type="radio" name="register-tier" value="premium" />
                    <span>高级会员</span>
                  </label>
                </div>
                <div v-if="registerForm.tier !== 'free'" class="reg-tier-details">
                  <div class="form-group form-group--compact">
                    <label class="form-label">开通时长</label>
                    <select v-model="registerForm.months" class="form-input tier-select">
                      <option v-for="m in 12" :key="m" :value="m">{{ m }} 个月</option>
                    </select>
                  </div>
                  <div class="tier-preview">
                    到期日期：<strong>{{ registerExpirePreview }}</strong>
                  </div>
                </div>
              </div>

              <div v-if="registerError" class="register-error">{{ registerError }}</div>
            </form>
            <div class="modal-footer">
              <button type="button" class="btn-cancel" @click="closeRegisterModal">取消</button>
              <button type="submit" form="register-form" class="btn-submit" :disabled="!isRegFormValid || isRegistering">
                {{ isRegistering ? '注册中...' : '注册' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- ========== Permission Modal ========== -->
      <Teleport to="body">
        <div v-if="showPermModal" class="modal-overlay" @click.self="closePermissionModal">
          <div class="modal-card perm-modal">
            <div class="modal-header">
              <h2>管理模板权限</h2>
              <button class="modal-close" @click="closePermissionModal">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <div class="modal-body">
              <!-- User info -->
              <div class="perm-user-info">
                <div class="perm-user-avatar">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div>
                  <div class="perm-user-name">{{ permTarget?.nickname || permTarget?.username || '用户' }}</div>
                  <div class="perm-user-meta">{{ permTarget?.phone || ('ID: ' + (permTarget?.user_id ?? permTarget?.id)) }}</div>
                </div>
              </div>

              <!-- Templates list -->
              <div v-if="permLoading" class="cm-loading" style="padding:32px">
                <div class="loading-spinner"></div>
              </div>
              <!-- Feature Permissions -->
              <div v-if="!permLoading" class="perm-features">
                <div class="perm-section-title">
                  <span>功能权限</span>
                </div>
                <div class="perm-template-list">
                  <div
                    class="perm-template-item"
                    :class="{ checked: featurePermissions['sales_agent'] }"
                    @click="featurePermissions['sales_agent'] = !featurePermissions['sales_agent']"
                  >
                    <div
                      class="custom-checkbox"
                      :class="{ checked: featurePermissions['sales_agent'] }"
                    >
                      <svg v-if="featurePermissions['sales_agent']" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <span class="perm-template-name">销售智能体</span>
                  </div>
                </div>
              </div>
              <div v-if="!permLoading" class="perm-templates">
                <div class="perm-section-title">
                  <span>可用模板</span>
                  <span class="perm-count">{{ allTemplates.length }}</span>
                  <button type="button" class="perm-select-all-btn" @click="togglePermSelectAll">
                    {{ isPermAllSelected ? '取消全选' : '全选' }}
                  </button>
                </div>
                <div class="perm-template-list">
                  <div
                    v-for="tpl in allTemplates"
                    :key="tpl.id"
                    class="perm-template-item"
                    :class="{ checked: permSelectedIds[String(tpl.id)] }"
                    @click="togglePermTemplate(String(tpl.id))"
                  >
                    <div
                      class="custom-checkbox"
                      :class="{ checked: permSelectedIds[String(tpl.id)] }"
                    >
                      <svg v-if="permSelectedIds[String(tpl.id)]" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <span class="perm-template-name">{{ tpl.name }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-cancel" @click="closePermissionModal">取消</button>
              <button type="button" class="btn-submit" :disabled="permSaving" @click="savePermissions">
                {{ permSaving ? '保存中...' : '保存更改' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- ========== Batch Confirm Modal ========== -->
      <Teleport to="body">
        <div v-if="showBatchConfirm" class="modal-overlay" @click.self="showBatchConfirm = false">
          <div class="modal-card batch-confirm-modal">
            <div class="modal-header">
              <h2>{{ batchAction === 'grant' ? '批量授权确认' : '批量撤销确认' }}</h2>
              <button class="modal-close" @click="showBatchConfirm = false">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <div class="modal-body">
              <p v-if="batchAction === 'grant'">
                确定要为选中的 <strong>{{ selectedIds.size }}</strong> 位用户授权全部 <strong>{{ allTemplates.length }}</strong> 个模板吗？
              </p>
              <p v-else class="batch-revoke-warning">
                危险操作：确定要撤销选中的 <strong>{{ selectedIds.size }}</strong> 位用户的全部模板权限吗？
              </p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-cancel" @click="showBatchConfirm = false">取消</button>
              <button
                type="button"
                :class="batchAction === 'revoke' ? 'btn-danger' : 'btn-submit'"
                @click="executeBatchAction"
              >
                确认{{ batchAction === 'grant' ? '授权' : '撤销' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- ========== Tier Upgrade Modal ========== -->
      <Teleport to="body">
        <div v-if="showTierModal" class="modal-overlay" @click.self="closeTierModal">
          <div class="modal-card tier-modal">
            <div class="modal-header">
              <h2>升级会员</h2>
              <button class="modal-close" @click="closeTierModal">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <div class="modal-body">
              <!-- User info -->
              <div class="tier-user-info">
                <div class="perm-user-avatar">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div>
                  <div class="perm-user-name">{{ tierTarget?.nickname || tierTarget?.username || '用户' }}</div>
                  <div class="perm-user-meta">
                    当前等级：<span class="tier-badge tier-badge-sm" :class="tierTarget ? getTierClass(tierTarget) : ''">{{ tierTarget ? getTierLabel(tierTarget) : '' }}</span>
                  </div>
                </div>
              </div>

              <!-- Tier options -->
              <div v-if="tierTarget" class="tier-options">
                <div
                  v-if="getActualTier(tierTarget) === 'free'"
                  class="tier-option-card tier-standard-card"
                  :class="{ selected: tierForm.tier === 'standard' }"
                  @click="tierForm.tier = 'standard'"
                >
                  <div class="tier-option-radio" :class="{ active: tierForm.tier === 'standard' }"></div>
                  <div class="tier-option-content">
                    <div class="tier-option-title tier-standard-text">普通会员</div>
                    <div class="tier-option-desc">每月 20 次 SOP 运行</div>
                  </div>
                </div>
                <div
                  class="tier-option-card tier-premium-card"
                  :class="{ selected: tierForm.tier === 'premium' }"
                  @click="tierForm.tier = 'premium'"
                >
                  <div class="tier-option-radio" :class="{ active: tierForm.tier === 'premium' }"></div>
                  <div class="tier-option-content">
                    <div class="tier-option-title tier-premium-text">高级会员</div>
                    <div class="tier-option-desc">无限次 SOP 运行</div>
                  </div>
                </div>
              </div>

              <!-- Duration -->
              <div class="tier-duration">
                <label class="form-label">开通时长</label>
                <select v-model="tierForm.months" class="form-input tier-select">
                  <option v-for="m in 12" :key="m" :value="m">{{ m }} 个月</option>
                </select>
              </div>

              <!-- Preview -->
              <div v-if="tierForm.tier" class="tier-preview">
                到期日期：<strong>{{ tierExpirePreview }}</strong>
                <span class="tier-preview-hint">（每月按 30 天计算）</span>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-cancel" @click="closeTierModal">取消</button>
              <button
                type="button"
                class="btn-submit"
                :disabled="isTierUpdating || !tierForm.tier"
                @click="handleTierUpgrade"
              >
                {{ isTierUpdating ? '升级中...' : '确认升级' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- ========== Toast ========== -->
      <Teleport to="body">
        <Transition name="toast">
          <div v-if="toast.visible" class="cm-toast" :class="'toast-' + toast.type">
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

// Register modal
type TierValue = 'free' | 'standard' | 'premium'
const showRegisterModal = ref(false)
const registerForm = ref<{ username: string; password: string; nickname: string; tier: TierValue; months: number }>({ username: '', password: '', nickname: '', tier: 'free', months: 1 })
const isRegistering = ref(false)
const usernameStatus = ref<'available' | 'taken' | 'checking' | null>(null)
const registerError = ref('')

// Batch confirm
const showBatchConfirm = ref(false)
const batchAction = ref<'grant' | 'revoke'>('grant')

// Permission modal
const showPermModal = ref(false)
const permTarget = ref<SubUser | null>(null)
const permLoading = ref(false)
const permSaving = ref(false)
const permSelectedIds = reactive<Record<string, boolean>>({})
const permOriginalIds = ref<Set<string>>(new Set())

// Feature permission state
const featurePermissions = reactive<Record<string, boolean>>({})
const featurePermOriginal = ref<Set<string>>(new Set())

// Tier upgrade modal
const showTierModal = ref(false)
const tierTarget = ref<SubUser | null>(null)
const tierForm = ref({ tier: '', months: 1 })
const isTierUpdating = ref(false)

// Action dropdown
const openMenuId = ref<number | string | null>(null)

// Toast
const toast = ref({ visible: false, message: '', type: 'success' as 'success' | 'error' | 'info' })
let toastTimer: ReturnType<typeof setTimeout> | null = null
let searchTimer: ReturnType<typeof setTimeout> | null = null

// ── Computed ───────────────────────────────────────────────────────
const filteredUsers = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return allSubUsers.value
  return allSubUsers.value.filter((u) => {
    const nickname = (u.nickname || '').toLowerCase()
    const phone = (u.phone || '').toLowerCase()
    return nickname.includes(q) || phone.includes(q)
  })
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

function computeExpireDate(months: number): string {
  if (!months) return ''
  const d = new Date()
  d.setDate(d.getDate() + months * 30)
  return d.toLocaleDateString('zh-CN')
}

const tierExpirePreview = computed(() => computeExpireDate(tierForm.value.months))
const registerExpirePreview = computed(() => computeExpireDate(registerForm.value.months))

// Real-time field validation (mirrors old frontend validateRegForm logic)
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
  const usernameOk = /^[a-zA-Z0-9]{3,20}$/.test(username)
  const passwordOk = passwordRegex.test(password)
  const nicknameOk = nickname.length >= 2 && nickname.length <= 20
  const usernameNotTaken = usernameStatus.value !== 'taken'
  return usernameOk && passwordOk && nicknameOk && usernameNotTaken
})

// ── Lifecycle ──────────────────────────────────────────────────────
function handleGlobalClick() {
  openMenuId.value = null
}

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
      // total_runs will be computed from sub-users after they load
      statistics.total_runs = 0
    }
  } catch (e) {
    console.error('加载统计数据失败:', e)
  }
}

async function loadSubUsers() {
  try {
    const res = await fetchSubUsers(0, 1000)
    if (res.code === 200 || res.code === 0) {
      const d = res.data as any
      allSubUsers.value = Array.isArray(d) ? d : d?.sub_users || []
      // Aggregate total runs from all sub-users
      statistics.total_runs = allSubUsers.value.reduce(
        (sum, u) => sum + (u.total_sop_runs || 0), 0
      )
    }
  } catch (e) {
    console.error('加载子用户列表失败:', e)
  }
}

async function loadAllTemplates() {
  try {
    const res = await fetchAllTemplates()
    if (res.code === 200 || res.code === 0) {
      const td = res.data as any
      const raw: any[] = Array.isArray(td) ? td : td?.templates || []
      // API returns uppercase "ID"; normalize to lowercase "id"
      allTemplates.value = raw.map((t) => ({
        ...t,
        id: t.id ?? t.ID,
        name: t.name || '',
      }))
    }
  } catch (e) {
    console.error('加载模板列表失败:', e)
  }
}

// ── Search ─────────────────────────────────────────────────────────
function handleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentPage.value = 1
  }, 300)
}

// ── Selection ──────────────────────────────────────────────────────
function toggleSelect(id: number | string) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id)
  } else {
    selectedIds.add(id)
  }
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
    if (res.code === 200 || res.code === 0) {
      usernameStatus.value = res.data?.available ? 'available' : 'taken'
    } else {
      usernameStatus.value = 'taken'
    }
  } catch {
    // API 返回错误码（如用户名已存在）会被 axios 拦截器 reject 到这里
    usernameStatus.value = 'taken'
  }
}

function validateRegisterForm(): string | null {
  const username = registerForm.value.username.trim()
  const password = registerForm.value.password
  const nickname = registerForm.value.nickname.trim()

  if (!/^[a-zA-Z0-9]{3,20}$/.test(username)) return '用户名需要3-20位字母数字'
  if (password.length < 6 || password.length > 18) return '密码需要6-18位'
  if (!nickname || nickname.length < 2 || nickname.length > 20) return '昵称需要2-20位'
  if (registerForm.value.tier !== 'free') {
    if (!['standard', 'premium'].includes(registerForm.value.tier)) return '无效的会员等级'
    if (!registerForm.value.months || registerForm.value.months < 1 || registerForm.value.months > 12) return '开通时长需要1-12个月'
  }
  return null
}

async function handleRegister() {
  const error = validateRegisterForm()
  if (error) {
    registerError.value = error
    return
  }
  if (usernameStatus.value === 'taken') {
    registerError.value = '用户名已被使用'
    return
  }
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
  } finally {
    isRegistering.value = false
  }
}

// ── Permission Management ──────────────────────────────────────────
async function openPermissionModal(user: SubUser) {
  permTarget.value = user
  showPermModal.value = true
  permLoading.value = true
  Object.keys(permSelectedIds).forEach((k) => delete permSelectedIds[k])
  permOriginalIds.value = new Set()

  const userId = user.user_id ?? user.id

  // 并行加载模板权限和功能权限
  try {
    const [templateRes, featureRes] = await Promise.all([
      fetchUserTemplates(userId).catch((e) => { console.error('加载授权模板失败:', e); return null }),
      fetchUserFeatures(userId).catch((e) => { console.error('加载功能权限失败:', e); return null })
    ])

    if (templateRes && (templateRes.code === 200 || templateRes.code === 0)) {
      const d = templateRes.data as Record<string, unknown> | unknown[]
      const rawAuth = (Array.isArray(d) ? d : (d as Record<string, unknown>)?.templates || []) as Array<Record<string, unknown>>
      rawAuth.forEach((t) => {
        const id = String(t.id ?? t.ID)
        permSelectedIds[id] = true
        permOriginalIds.value.add(id)
      })
    }

    if (featureRes && (featureRes.code === 200 || featureRes.code === 0)) {
      const features = (featureRes.data as any)?.features || []
      if (Array.isArray(features)) {
        features.forEach((f: string) => {
          featurePermissions[f] = true
          featurePermOriginal.value.add(f)
        })
      }
    }
  } finally {
    permLoading.value = false
  }
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
  if (permSelectedIds[id]) {
    delete permSelectedIds[id]
  } else {
    permSelectedIds[id] = true
  }
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
    // Calculate diff
    const toGrant: string[] = []
    const toRevoke: string[] = []

    // Feature permission diff
    const featuresToGrant: string[] = []
    const featuresToRevoke: string[] = []
    Object.keys(featurePermissions).forEach((key) => {
      if (!featurePermOriginal.value.has(key)) featuresToGrant.push(key)
    })
    featurePermOriginal.value.forEach((key) => {
      if (!featurePermissions[key]) featuresToRevoke.push(key)
    })

    if (featuresToGrant.length > 0) {
      await grantFeatures(userId, featuresToGrant)
    }
    if (featuresToRevoke.length > 0) {
      await revokeFeatures(userId, featuresToRevoke)
    }

    Object.keys(permSelectedIds).forEach((id) => {
      if (!permOriginalIds.value.has(id)) toGrant.push(id)
    })
    permOriginalIds.value.forEach((id) => {
      if (!permSelectedIds[id]) toRevoke.push(id)
    })

    if (toGrant.length === 0 && toRevoke.length === 0 && featuresToGrant.length === 0 && featuresToRevoke.length === 0) {
      showToast('没有变更', 'info')
      closePermissionModal()
      return
    }

    if (toGrant.length > 0) {
      await grantTemplates(userId, toGrant.map(Number))
    }
    if (toRevoke.length > 0) {
      await revokeTemplates(userId, toRevoke.map(Number))
    }

    showToast('权限已更新', 'success')
    closePermissionModal()
    await loadSubUsers()
  } catch (e: unknown) {
    showToast(`保存失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error')
  } finally {
    permSaving.value = false
  }
}

// ── Batch Operations ───────────────────────────────────────────────
function batchGrant() {
  if (allTemplates.value.length === 0) {
    showToast('没有可用模板', 'info')
    return
  }
  batchAction.value = 'grant'
  showBatchConfirm.value = true
}

function batchRevoke() {
  batchAction.value = 'revoke'
  showBatchConfirm.value = true
}

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
  } catch (e: unknown) {
    showToast(`批量操作失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error')
  }
}

// ── Helpers ────────────────────────────────────────────────────────
function getTierClass(user: SubUser) {
  const tier = user.user_tier || 'free'
  const isExpired = user.tier_expires && new Date(user.tier_expires) < new Date()
  if (isExpired || tier === 'free') return 'tier-free'
  if (tier === 'premium') return 'tier-premium'
  if (tier === 'standard') return 'tier-standard'
  return 'tier-free'
}

function getTierLabel(user: SubUser) {
  const tier = user.user_tier || 'free'
  const isExpired = user.tier_expires && new Date(user.tier_expires) < new Date()
  if (isExpired || tier === 'free') return '免费用户'
  if (tier === 'premium') return '高级会员'
  if (tier === 'standard') {
    const remaining = user.remaining_sop_runs
    if (remaining !== undefined && remaining >= 0) return `普通会员 (剩余${remaining}次)`
    return '普通会员'
  }
  return '免费用户'
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function showToast(message: string, type: 'success' | 'error' | 'info' = 'success', duration = 3000) {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = { visible: true, message, type }
  toastTimer = setTimeout(() => { toast.value.visible = false }, duration)
}

// ── Action Dropdown ───────────────────────────────────────────────
function toggleActionMenu(id: number | string) {
  openMenuId.value = openMenuId.value === id ? null : id
}

function handleMenuPermission(user: SubUser) {
  openMenuId.value = null
  openPermissionModal(user)
}

function handleMenuUpgrade(user: SubUser) {
  if (!canUpgrade(user)) return
  openMenuId.value = null
  openTierModal(user)
}

// ── Tier Upgrade ──────────────────────────────────────────────────
function getActualTier(user: SubUser): string {
  const tier = user.user_tier || 'free'
  const isExpired = user.tier_expires && new Date(user.tier_expires) < new Date()
  if (isExpired || tier === 'free') return 'free'
  return tier
}

function canUpgrade(user: SubUser): boolean {
  return getActualTier(user) !== 'premium'
}

function openTierModal(user: SubUser) {
  tierTarget.value = user
  const actual = getActualTier(user)
  // 默认选中比当前高一级的等级
  if (actual === 'free') {
    tierForm.value = { tier: 'standard', months: 1 }
  } else {
    tierForm.value = { tier: 'premium', months: 1 }
  }
  showTierModal.value = true
}

function closeTierModal() {
  showTierModal.value = false
  tierTarget.value = null
  tierForm.value = { tier: '', months: 1 }
}

async function handleTierUpgrade() {
  if (!tierTarget.value || !tierForm.value.tier) return
  const userId = tierTarget.value.user_id ?? tierTarget.value.id
  isTierUpdating.value = true

  try {
    const res = await updateSubUserTier(userId, {
      tier: tierForm.value.tier,
      months: tierForm.value.months
    })
    if (res.code === 200 || res.code === 0) {
      showToast('升级成功', 'success')
      closeTierModal()
      await loadSubUsers()
    }
  } catch (e: unknown) {
    showToast(`升级失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error')
  } finally {
    isTierUpdating.value = false
  }
}
</script>

<style scoped>
/* ── Page ─────────────────────────────────────────────────────── */
.customers-page {
  max-width: 1400px;
  margin: 0 auto;
}

.cm-page-header {
  margin-bottom: 28px;
}

.cm-title {
  font-size: 28px;
  font-weight: 800;
  color: hsl(150, 10%, 15%);
  margin: 0 0 4px;
  letter-spacing: -0.01em;
}

.cm-subtitle {
  font-size: 14px;
  color: hsl(150, 10%, 45%);
  margin: 0;
}

/* ── Stats Grid ───────────────────────────────────────────────── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}

.stat-card {
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.04);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon-users {
  background: hsl(220, 60%, 95%);
  color: hsl(220, 60%, 50%);
}

.stat-icon-active {
  background: hsl(158, 60%, 93%);
  color: hsl(158, 64%, 40%);
}

.stat-icon-template {
  background: hsl(280, 60%, 95%);
  color: hsl(280, 60%, 50%);
}

.stat-icon-runs {
  background: hsl(30, 80%, 95%);
  color: hsl(30, 80%, 50%);
}

.stat-value {
  font-size: 24px;
  font-weight: 800;
  color: hsl(150, 10%, 15%);
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: hsl(150, 10%, 50%);
  margin-top: 2px;
}

/* ── Sub-users Section ────────────────────────────────────────── */
.subusers-section {
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.04);
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  gap: 16px;
  flex-wrap: wrap;
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  color: hsl(150, 10%, 15%);
  margin: 0;
}

.section-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cm-search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.cm-search-icon {
  position: absolute;
  left: 12px;
  color: hsl(150, 10%, 55%);
  pointer-events: none;
}

.cm-search-input {
  width: 240px;
  height: 38px;
  padding: 0 12px 0 38px;
  border-radius: 10px;
  border: 1px solid hsl(150, 15%, 88%);
  background: hsl(150, 20%, 98%);
  font-size: 13px;
  color: hsl(150, 10%, 15%);
  transition: all 0.2s;
  outline: none;
}

.cm-search-input:focus {
  border-color: hsl(158, 64%, 50%);
  box-shadow: 0 0 0 3px hsl(158, 50%, 92%);
  background: #fff;
}

.cm-register-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 16px;
  border-radius: 10px;
  background: hsl(158, 64%, 40%);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: background 0.2s;
}

.cm-register-btn:hover {
  background: hsl(158, 64%, 35%);
}

/* ── Loading / Empty ──────────────────────────────────────────── */
.cm-loading {
  padding: 60px;
  text-align: center;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid hsl(150, 15%, 88%);
  border-top-color: hsl(158, 64%, 50%);
  border-radius: 50%;
  animation: spinner 0.8s linear infinite;
  margin: 0 auto 12px;
}

@keyframes spinner {
  to { transform: rotate(360deg); }
}

.cm-loading p {
  font-size: 14px;
  color: hsl(150, 10%, 50%);
}

.cm-empty {
  padding: 80px 0;
  text-align: center;
  color: hsl(150, 10%, 55%);
}

.cm-empty h3 {
  font-size: 16px;
  color: hsl(150, 10%, 25%);
  margin: 16px 0 8px;
}

.cm-empty p {
  font-size: 14px;
  color: hsl(150, 10%, 50%);
  margin: 0;
}

/* ── Table ────────────────────────────────────────────────────── */
.cm-table-wrap {
  overflow-x: auto;
}

.cm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.cm-table th {
  text-align: center;
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 600;
  color: hsl(150, 10%, 45%);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid hsl(150, 15%, 92%);
  white-space: nowrap;
}

.cm-table td {
  padding: 14px 16px;
  border-bottom: 1px solid hsl(150, 15%, 95%);
  color: hsl(150, 10%, 25%);
  text-align: center;
}

.cm-table tr:hover td {
  background: hsl(150, 20%, 98%);
}

.cm-table tr.selected-row td {
  background: hsl(158, 50%, 97%);
}

.th-checkbox, .td-checkbox {
  width: 44px;
  text-align: center;
}

/* Checkbox */
.custom-checkbox {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.custom-checkbox.checked {
  background: hsl(158, 64%, 40%);
  border-color: hsl(158, 64%, 40%);
}

.custom-checkbox.checked svg {
  color: #fff;
}

/* User info cell */
.user-info-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-name-text {
  font-weight: 600;
  color: hsl(150, 10%, 15%);
}

.user-meta-text {
  font-size: 12px;
  color: hsl(150, 10%, 50%);
}

/* Tier badge */
.tier-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
}

.tier-free {
  background: hsl(0, 0%, 92%);
  color: hsl(150, 10%, 45%);
}

.tier-standard {
  background: linear-gradient(135deg, hsl(158, 60%, 95%), hsl(158, 60%, 90%));
  color: hsl(158, 64%, 35%);
}

.tier-premium {
  background: linear-gradient(135deg, hsl(45, 100%, 95%), hsl(45, 100%, 90%));
  color: hsl(45, 100%, 40%);
}

.date-text {
  font-size: 13px;
  color: hsl(150, 10%, 45%);
}

.template-count-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: hsl(150, 10%, 40%);
}

.template-count-badge svg {
  color: hsl(150, 10%, 55%);
}

.runs-count {
  font-size: 14px;
  font-weight: 500;
  color: hsl(150, 10%, 25%);
}

.action-btn {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid hsl(150, 15%, 85%);
  background: #fff;
  font-size: 13px;
  color: hsl(158, 64%, 40%);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.action-btn:hover {
  background: hsl(158, 50%, 95%);
  border-color: hsl(158, 64%, 50%);
}

/* ── Pagination ───────────────────────────────────────────────── */
.cm-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 20px 0 4px;
}

.pagination-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid hsl(150, 15%, 88%);
  background: #fff;
  font-size: 13px;
  color: hsl(150, 10%, 35%);
  cursor: pointer;
  transition: all 0.2s;
}

.pagination-btn:hover:not(:disabled) {
  background: hsl(150, 15%, 96%);
  border-color: hsl(150, 15%, 80%);
}

.pagination-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pagination-info {
  font-size: 13px;
  color: hsl(150, 10%, 50%);
}

/* ── Batch Action Bar ─────────────────────────────────────────── */
.batch-action-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  background: hsl(150, 10%, 15%);
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  z-index: 100;
}

.batch-count {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
}

.batch-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.batch-grant {
  background: hsl(158, 64%, 40%);
  color: #fff;
}

.batch-grant:hover {
  background: hsl(158, 64%, 35%);
}

.batch-revoke {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.batch-revoke:hover {
  background: rgba(239, 68, 68, 0.8);
  border-color: transparent;
}

.batch-bar-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.batch-bar-leave-active {
  transition: all 0.2s ease-in;
}

.batch-bar-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

.batch-bar-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

/* ── Modal ────────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: modalFadeIn 0.2s ease-out;
}

@keyframes modalFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  width: 90%;
  max-width: 520px;
  animation: modalScaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.perm-modal {
  max-width: 560px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.perm-modal .modal-body {
  overflow-y: auto;
  flex: 1;
}

@keyframes modalScaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid hsl(150, 15%, 92%);
}

.modal-header h2 {
  font-size: 18px;
  font-weight: 700;
  color: hsl(150, 10%, 15%);
  margin: 0;
}

.modal-close {
  background: transparent;
  border: none;
  cursor: pointer;
  color: hsl(150, 10%, 50%);
  padding: 4px;
  border-radius: 6px;
}

.modal-close:hover {
  color: hsl(150, 10%, 25%);
}

.modal-body {
  padding: 24px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 0 24px 24px;
}

/* Form */
.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: hsl(150, 10%, 25%);
  margin-bottom: 8px;
}

.required {
  color: #ef4444;
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid hsl(150, 15%, 88%);
  border-radius: 10px;
  font-size: 14px;
  color: hsl(150, 10%, 15%);
  background: hsl(150, 20%, 98%);
  outline: none;
  transition: all 0.2s;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: hsl(158, 64%, 50%);
  box-shadow: 0 0 0 3px hsl(158, 50%, 92%);
  background: #fff;
}

.form-input.input-error {
  border-color: #ef4444;
}

.form-input.input-error:focus {
  border-color: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
}

.field-error {
  margin-top: 6px;
  font-size: 12px;
  color: #ef4444;
}

.username-hint {
  margin-top: 6px;
  font-size: 12px;
}

.username-hint.available {
  color: hsl(158, 64%, 40%);
}

.username-hint.taken {
  color: #ef4444;
}

.username-hint.checking {
  color: hsl(150, 10%, 50%);
}

.btn-cancel {
  padding: 8px 20px;
  border-radius: 10px;
  border: 1px solid hsl(150, 15%, 85%);
  background: #fff;
  font-size: 14px;
  color: hsl(150, 10%, 35%);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: hsl(150, 15%, 96%);
}

.btn-submit {
  padding: 8px 24px;
  border-radius: 10px;
  border: none;
  background: hsl(158, 64%, 40%);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-submit:hover:not(:disabled) {
  background: hsl(158, 64%, 35%);
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Register Error ───────────────────────────────────────────── */
.register-error {
  color: #ef4444;
  font-size: 13px;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.06);
  border-radius: 8px;
  border-left: 3px solid #ef4444;
}

/* ── Batch Confirm ───────────────────────────────────────────── */
.batch-confirm-modal {
  max-width: 440px;
}

.batch-confirm-modal .modal-body p {
  font-size: 14px;
  color: hsl(150, 10%, 35%);
  line-height: 1.6;
  margin: 0;
}

.batch-revoke-warning {
  color: #ef4444 !important;
}

.btn-danger {
  padding: 8px 24px;
  border-radius: 10px;
  border: none;
  background: #ef4444;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-danger:hover {
  background: #dc2626;
}

/* ── Permission Modal ─────────────────────────────────────────── */
.perm-user-info {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid hsl(150, 15%, 92%);
}

.perm-user-avatar {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: linear-gradient(135deg, hsl(158, 50%, 92%), hsl(158, 50%, 88%));
  display: flex;
  align-items: center;
  justify-content: center;
  color: hsl(158, 64%, 40%);
}

.perm-user-name {
  font-size: 16px;
  font-weight: 700;
  color: hsl(150, 10%, 15%);
}

.perm-user-meta {
  font-size: 13px;
  color: hsl(150, 10%, 50%);
  margin-top: 2px;
}

.perm-features {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-light, #e5e7eb);
}

.perm-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: hsl(150, 10%, 25%);
  margin-bottom: 12px;
}

.perm-count {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background: hsl(150, 15%, 92%);
  color: hsl(150, 10%, 45%);
}

.perm-select-all-btn {
  margin-left: auto;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid hsl(150, 15%, 85%);
  background: #fff;
  font-size: 12px;
  color: hsl(158, 64%, 40%);
  cursor: pointer;
  transition: all 0.2s;
}

.perm-select-all-btn:hover {
  background: hsl(158, 50%, 95%);
  border-color: hsl(158, 64%, 50%);
}

.perm-template-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.perm-template-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid hsl(150, 15%, 92%);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.perm-template-item:hover {
  background: hsl(150, 20%, 98%);
}

.perm-template-item.checked {
  background: hsl(158, 50%, 97%);
  border-color: hsl(158, 40%, 80%);
}

.perm-template-name {
  font-size: 14px;
  color: hsl(150, 10%, 20%);
}

/* ── Toast ────────────────────────────────────────────────────── */
.cm-toast {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  z-index: 2000;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  pointer-events: none;
}

.toast-success {
  background: hsl(158, 64%, 40%);
  color: #fff;
}

.toast-error {
  background: #ef4444;
  color: #fff;
}

.toast-info {
  background: hsl(150, 10%, 25%);
  color: #fff;
}

.toast-enter-active {
  transition: all 0.3s ease-out;
}

.toast-leave-active {
  transition: all 0.2s ease-in;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-16px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}

/* ── Tier Upgrade ─────────────────────────────────────────────── */
.tier-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.tier-upgrade-btn {
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid hsl(158, 40%, 80%);
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: hsl(158, 64%, 40%);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.tier-upgrade-btn:hover {
  background: hsl(158, 50%, 95%);
  border-color: hsl(158, 64%, 50%);
}

.tier-modal {
  max-width: 480px;
}

.tier-user-info {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid hsl(150, 15%, 92%);
}

.tier-badge-sm {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  vertical-align: middle;
}

.tier-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.tier-option-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 2px solid hsl(150, 15%, 90%);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.tier-option-card:hover:not(.disabled) {
  border-color: hsl(150, 15%, 80%);
}

.tier-standard-card.selected {
  border-color: hsl(158, 64%, 50%);
  background: hsl(158, 60%, 97%);
}

.tier-premium-card.selected {
  border-color: hsl(45, 80%, 55%);
  background: hsl(45, 100%, 97%);
}

.tier-option-card.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.tier-option-radio {
  width: 18px;
  height: 18px;
  border: 2px solid hsl(150, 15%, 75%);
  border-radius: 50%;
  flex-shrink: 0;
  position: relative;
  transition: all 0.2s;
}

.tier-option-radio.active {
  border-color: hsl(158, 64%, 45%);
}

.tier-option-radio.active::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: hsl(158, 64%, 45%);
}

.tier-option-content {
  flex: 1;
}

.tier-option-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 2px;
}

.tier-standard-text {
  color: hsl(158, 64%, 35%);
}

.tier-premium-text {
  color: hsl(45, 100%, 40%);
}

.tier-option-desc {
  font-size: 13px;
  color: hsl(150, 10%, 50%);
}

.tier-duration {
  margin-bottom: 16px;
}

.tier-select {
  appearance: auto;
  cursor: pointer;
}

.tier-preview {
  padding: 12px 16px;
  background: hsl(150, 20%, 97%);
  border-radius: 10px;
  font-size: 14px;
  color: hsl(150, 10%, 35%);
}

.tier-preview strong {
  color: hsl(150, 10%, 15%);
}

.tier-preview-hint {
  font-size: 12px;
  color: hsl(150, 10%, 55%);
}

/* ── Register Tier Section ───────────────────────────────────── */
.reg-tier-section {
  margin-bottom: 20px;
}

.reg-tier-divider {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.reg-tier-divider::before,
.reg-tier-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: hsl(150, 15%, 90%);
}

.reg-tier-divider-text {
  padding: 0 12px;
  font-size: 12px;
  color: hsl(150, 10%, 50%);
  white-space: nowrap;
}

.reg-tier-radios {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
  border: 1px solid hsl(150, 15%, 88%);
  border-radius: 10px;
  overflow: hidden;
}

.reg-tier-radio {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: hsl(150, 10%, 40%);
  background: hsl(150, 20%, 98%);
  transition: all 0.2s;
  border-right: 1px solid hsl(150, 15%, 88%);
}

.reg-tier-radio:last-child {
  border-right: none;
}

.reg-tier-radio input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.reg-tier-radio.active {
  background: hsl(158, 50%, 95%);
  color: hsl(158, 64%, 35%);
  font-weight: 600;
}

.form-group--compact {
  margin-bottom: 12px;
}

.reg-tier-details {
  animation: fadeSlideDown 0.2s ease-out;
}

@keyframes fadeSlideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Action Dropdown ─────────────────────────────────────────── */
.action-dropdown {
  position: relative;
  display: inline-block;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.action-menu {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 4px;
  min-width: 140px;
  background: #fff;
  border: 1px solid hsl(150, 15%, 90%);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  z-index: 200;
  padding: 4px;
  animation: fadeSlideDown 0.15s ease-out;
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
  color: hsl(150, 10%, 25%);
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s;
  white-space: nowrap;
}

.action-menu-item:hover:not(.disabled) {
  background: hsl(150, 20%, 96%);
}

.action-menu-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Responsive ───────────────────────────────────────────────── */
@media (max-width: 1024px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .section-actions {
    width: 100%;
  }

  .cm-search-input {
    flex: 1;
    width: auto;
  }
}
</style>
