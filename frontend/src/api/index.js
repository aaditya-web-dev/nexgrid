import client from './client';

export const authApi = {
  register: (payload) => client.post('/api/auth/register', payload),
  login: (payload) => client.post('/api/auth/login', payload),
  refresh: (refreshToken) => client.post('/api/auth/refresh', { refresh_token: refreshToken }),
  getMe: () => client.get('/api/auth/me'),
};

export const workspacesApi = {
  list: () => client.get('/api/workspaces'),
  get: (workspaceId) => client.get(`/api/workspaces/${workspaceId}`),
  create: (payload) => client.post('/api/workspaces', payload),
  update: (workspaceId, payload) => client.patch(`/api/workspaces/${workspaceId}`, payload),
  delete: (workspaceId) => client.delete(`/api/workspaces/${workspaceId}`),
  
  // Member management
  listMembers: (workspaceId) => client.get(`/api/workspaces/${workspaceId}/members`),
  inviteMember: (workspaceId, payload) => client.post(`/api/workspaces/${workspaceId}/members`, payload),
  updateMemberRole: (workspaceId, userId, payload) => client.patch(`/api/workspaces/${workspaceId}/members/${userId}`, payload),
  removeMember: (workspaceId, userId) => client.delete(`/api/workspaces/${workspaceId}/members/${userId}`),
};

export const collectionsApi = {
  list: (workspaceId) => client.get(`/api/workspaces/${workspaceId}/collections`),
  get: (collectionId) => client.get(`/api/collections/${collectionId}`),
  create: (workspaceId, payload) => client.post(`/api/workspaces/${workspaceId}/collections`, payload),
  update: (collectionId, payload) => client.patch(`/api/collections/${collectionId}`, payload),
  delete: (collectionId) => client.delete(`/api/collections/${collectionId}`),

  // Folders
  listFolders: (collectionId) => client.get(`/api/collections/${collectionId}/folders`),
  getFolder: (folderId) => client.get(`/api/folders/${folderId}`),
  createFolder: (collectionId, payload) => client.post(`/api/collections/${collectionId}/folders`, payload),
  updateFolder: (folderId, payload) => client.patch(`/api/folders/${folderId}`, payload),
  deleteFolder: (folderId) => client.delete(`/api/folders/${folderId}`),
};

export const requestsApi = {
  list: (collectionId, folderId = null) => {
    const params = folderId !== null && folderId !== undefined ? { folder_id: folderId } : {};
    return client.get(`/api/collections/${collectionId}/requests`, { params });
  },
  get: (requestId) => client.get(`/api/requests/${requestId}`),
  create: (collectionId, payload) => client.post(`/api/collections/${collectionId}/requests`, payload),
  update: (requestId, payload) => client.patch(`/api/requests/${requestId}`, payload),
  delete: (requestId) => client.delete(`/api/requests/${requestId}`),

  // Execution & Variable resolution
  resolve: (requestId, environmentId = null) => {
    const params = environmentId ? { environment_id: environmentId } : {};
    return client.get(`/api/requests/${requestId}/resolve`, { params });
  },
  execute: (requestId, environmentId = null, timeoutSeconds = 30.0) => {
    const params = {};
    if (environmentId) params.environment_id = environmentId;
    if (timeoutSeconds) params.timeout_seconds = timeoutSeconds;
    return client.post(`/api/requests/${requestId}/execute`, {}, { params });
  },
  listExecutions: (requestId, limit = 20) => client.get(`/api/requests/${requestId}/executions`, { params: { limit } }),
  getExecutionDetail: (executionId) => client.get(`/api/executions/${executionId}`),
  quickRun: (payload, timeoutSeconds = 30.0) => client.post('/api/requests/quick-run', payload, { params: { timeout_seconds: timeoutSeconds } }),
};

export const environmentsApi = {
  list: (workspaceId) => client.get(`/api/workspaces/${workspaceId}/environments`),
  get: (environmentId) => client.get(`/api/environments/${environmentId}`),
  create: (workspaceId, payload) => client.post(`/api/workspaces/${workspaceId}/environments`, payload),
  update: (environmentId, payload) => client.patch(`/api/environments/${environmentId}`, payload),
  delete: (environmentId) => client.delete(`/api/environments/${environmentId}`),

  // Variables
  listVariables: (environmentId) => client.get(`/api/environments/${environmentId}/variables`),
  addVariable: (environmentId, payload) => client.post(`/api/environments/${environmentId}/variables`, payload),
  updateVariable: (variableId, payload) => client.patch(`/api/variables/${variableId}`, payload),
  deleteVariable: (variableId) => client.delete(`/api/variables/${variableId}`),
};

export const healthApi = {
  hello: () => client.get('/api/hello'),
  health: () => client.get('/api/health'),
};

export const locksApi = {
  get: (requestId) => client.get(`/api/requests/${requestId}/lock`),
  acquire: (requestId) => client.post(`/api/requests/${requestId}/lock`),
  release: (requestId) => client.delete(`/api/requests/${requestId}/lock`),
};

export const commentsApi = {
  list: (requestId) => client.get(`/api/requests/${requestId}/comments`),
  create: (requestId, payload) => client.post(`/api/requests/${requestId}/comments`, payload),
  update: (commentId, payload) => client.patch(`/api/comments/${commentId}`, payload),
  delete: (commentId) => client.delete(`/api/comments/${commentId}`),
};

export const notificationsApi = {
  list: (workspaceId = null, unreadOnly = false) => {
    const params = {};
    if (workspaceId) params.workspace_id = workspaceId;
    if (unreadOnly) params.unread_only = true;
    return client.get('/api/notifications', { params });
  },
  markRead: (notificationIds) => client.patch('/api/notifications/mark-read', { notification_ids: notificationIds }),
  markAllRead: (workspaceId = null) => {
    const params = workspaceId ? { workspace_id: workspaceId } : {};
    return client.post('/api/notifications/mark-all-read', {}, { params });
  },
  delete: (notificationId) => client.delete(`/api/notifications/${notificationId}`),
};


export const testCasesApi = {
  generate: (requestId, payload = {}) =>
    client.post(`/api/requests/${requestId}/generate-tests`, payload),
  list: (requestId) => client.get(`/api/requests/${requestId}/test-cases`),
  create: (requestId, payload) =>
    client.post(`/api/requests/${requestId}/test-cases`, payload),
  update: (testId, payload) => client.patch(`/api/test-cases/${testId}`, payload),
  approve: (testId) => client.post(`/api/test-cases/${testId}/approve`),
  reject: (testId) => client.post(`/api/test-cases/${testId}/reject`),
  delete: (testId) => client.delete(`/api/test-cases/${testId}`),
  run: (testId, payload = {}) => client.post(`/api/test-cases/${testId}/run`, payload),
  getResults: (testId, limit = 20) =>
    client.get(`/api/test-cases/${testId}/results`, { params: { limit } }),
  runAll: (requestId, payload = {}) =>
    client.post(`/api/requests/${requestId}/run-tests`, payload),
};
