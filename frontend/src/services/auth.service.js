import api from "./api";

const login = async (email, password) => {
  const res = await api.post("/auth/login", { email, password });
  if (res.data.access_token) {
    localStorage.setItem("token", res.data.access_token);
    localStorage.setItem("user", JSON.stringify(res.data.user));
  }
  return res.data;
};

const logout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
};

const getCurrentUser = () => JSON.parse(localStorage.getItem("user") || "null");

const sendRegistrationVerification = async (email) => {
  const res = await api.post("/auth/verification/send", { email });
  return res.data;
};

const checkRegistrationEmail = async (email) => {
  const res = await api.post("/auth/email/check", { email });
  return res.data;
};

const verifyRegistrationCode = async (challengeId, selectedNumber) => {
  const res = await api.post("/auth/verification/verify", {
    challengeId,
    selectedNumber,
  });
  return res.data;
};

const registerAccount = async (registrationData) => {
  const res = await api.post("/auth/register", registrationData);
  return res.data;
};

export default {
  login,
  logout,
  getCurrentUser,
  checkRegistrationEmail,
  sendRegistrationVerification,
  verifyRegistrationCode,
  registerAccount,
};
