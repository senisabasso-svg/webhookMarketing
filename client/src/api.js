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
  getCompany: () => request("/company/company"),
  getIntegration: (type) => request(`/company/integrations/${type}`),
  updateIntegration: (type, config) =>
    request(`/company/integrations/${type}`, {
      method: "PUT",
      body: JSON.stringify({ config }),
    }),
};
