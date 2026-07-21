const API_BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}`);
  }

  return data;
}

export const api = {
  login: (email, password) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),
  listCompanies: () => request("/admin/companies"),
  createCompany: (payload) =>
    request("/admin/companies", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getIntegrationFields: () => request("/admin/integration-fields"),
  getFebrosTracking: () => request("/admin/febros-tracking"),
  getLeaderComment: () => request("/admin/leader-comment"),
  updateLeaderComment: (payload) =>
    request("/admin/leader-comment", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  uploadLeaderPdf: async (file) => {
    const form = new FormData();
    form.append("pdf", file);
    const res = await fetch("/api/admin/leader-comment/pdf", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  },
  deleteLeaderPdf: () =>
    request("/admin/leader-comment/pdf", { method: "DELETE" }),
  getVideoGenerationMeta: () => request("/admin/video-generation"),
  getVideoHistory: () => request("/admin/video-generation/history"),
  getAiChatMeta: () => request("/admin/ai-chat"),
  sendAiChat: (payload) =>
    request("/admin/ai-chat", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getCompanyAiChatMeta: () => request("/company/ai-chat"),
  sendCompanyAiChat: (payload) =>
    request("/company/ai-chat", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  generateVideo: async ({ seed, cfgScale, imageFile }) => {
    const form = new FormData();
    if (cfgScale != null) form.append("cfgScale", String(cfgScale));
    if (seed !== undefined && seed !== null && seed !== "") {
      form.append("seed", String(seed));
    }
    if (imageFile) form.append("image", imageFile);

    const res = await fetch("/api/admin/video-generation", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  },
  getCompany: () => request("/company/company"),
  getCompanyInstagramInsights: () => request("/company/instagram/insights"),
  getAdminCompanyInstagramInsights: (companyId) =>
    request(`/admin/companies/${companyId}/instagram/insights`),
  getLegacyInstagramInsights: () => request("/admin/instagram/insights/legacy"),
  getCompanyInstagramConversations: () =>
    request("/company/instagram/conversations"),
  getCompanyInstagramConversation: (userId) =>
    request(`/company/instagram/conversations/${encodeURIComponent(userId)}`),
  getAdminCompanyInstagramConversations: (companyId) =>
    request(`/admin/companies/${companyId}/instagram/conversations`),
  getAdminCompanyInstagramConversation: (companyId, userId) =>
    request(
      `/admin/companies/${companyId}/instagram/conversations/${encodeURIComponent(userId)}`
    ),
  getLegacyInstagramConversations: () =>
    request("/admin/instagram/conversations/legacy"),
  getLegacyInstagramConversation: (userId) =>
    request(
      `/admin/instagram/conversations/legacy/${encodeURIComponent(userId)}`
    ),
  getIntegration: (type) => request(`/company/integrations/${type}`),
  updateIntegration: (type, config) =>
    request(`/company/integrations/${type}`, {
      method: "PUT",
      body: JSON.stringify({ config }),
    }),
};
