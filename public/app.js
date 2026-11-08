const authPanel = document.querySelector("#auth-panel");
const appPanel = document.querySelector("#app-panel");
const authForm = document.querySelector("#auth-form");
const authTitle = document.querySelector("#auth-title");
const authDescription = document.querySelector("#auth-description");
const authToggle = document.querySelector("#auth-toggle");
const authSubmit = document.querySelector("#auth-submit");
const nameField = document.querySelector("#name-field");
const confirmPasswordField = document.querySelector("#confirm-password-field");
const nameInput = document.querySelector("#name");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const confirmPasswordInput = document.querySelector("#confirm-password");
const userName = document.querySelector("#user-name");
const userEmail = document.querySelector("#user-email");
const form = document.querySelector("#request-form");
const requests = document.querySelector("#requests");
const message = document.querySelector("#message");
let registerMode = false;
let currentUser = null;

function showMessage(text, kind = "") {
  message.textContent = text;
  message.className = kind;
}

function renderRequests(items) {
  if (!items.length) {
    requests.innerHTML = '<p class="empty">No requests yet for your account.</p>';
    return;
  }
  requests.innerHTML = items.map((item) => `
    <article class="request">
      <div class="request-top">
        <strong>Request #${item.id}</strong>
        <span class="status">${item.status}</span>
      </div>
      <p>${escapeHtml(item.agenda)}</p>
      <small>${escapeHtml(item.preferred_date)} · ${escapeHtml(item.preferred_time)}</small>
    </article>
  `).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[character]));
}

async function loadRequests() {
  requests.innerHTML = '<p class="empty">Loading requests...</p>';
  try {
    const response = await fetch("/api/advising-requests");
    const data = await response.json();
    if (response.status === 401) return showLoggedOut("Your session has expired. Please sign in again.");
    if (!response.ok) throw new Error(data.error || "Could not load requests");
    renderRequests(data);
  } catch (error) {
    requests.innerHTML = "";
    showMessage(error.message, "error");
  }
}

document.querySelector("#refresh").addEventListener("click", loadRequests);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("Submitting...");
  try {
    const response = await fetch("/api/advising-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agenda: document.querySelector("#agenda").value.trim(),
        preferred_date: document.querySelector("#date").value,
        preferred_time: document.querySelector("#time").value.trim()
      })
    });
    const data = await response.json();
    if (response.status === 401) return showLoggedOut("Your session has expired. Please sign in again.");
    if (!response.ok) throw new Error(data.error || "Could not submit request");
    form.reset();
    showMessage("Request submitted successfully.", "success");
    await loadRequests();
  } catch (error) {
    showMessage(error.message, "error");
  }
});

function showLoggedOut(text = "") {
  currentUser = null;
  authPanel.classList.remove("hidden");
  appPanel.classList.add("hidden");
  if (text) showMessage(text, "error");
}

function showLoggedIn(user) {
  currentUser = user;
  authPanel.classList.add("hidden");
  appPanel.classList.remove("hidden");
  userName.textContent = user.name;
  userEmail.textContent = user.email;
  showMessage("");
  loadRequests();
}

function updateAuthMode() {
  authTitle.textContent = registerMode ? "Create account" : "Sign in";
  authDescription.textContent = registerMode
    ? "Create a student account to submit and track advising requests."
    : "Sign in to view and submit your advising requests.";
  authToggle.textContent = registerMode ? "Use existing account" : "Create account";
  authSubmit.textContent = registerMode ? "Register" : "Sign in";
  nameField.classList.toggle("hidden", !registerMode);
  confirmPasswordField.classList.toggle("hidden", !registerMode);
  nameInput.required = registerMode;
  confirmPasswordInput.required = registerMode;
  passwordInput.autocomplete = registerMode ? "new-password" : "current-password";
}

authToggle.addEventListener("click", () => {
  registerMode = !registerMode;
  authForm.reset();
  updateAuthMode();
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(registerMode ? "Creating account..." : "Signing in...");
  const endpoint = registerMode ? "/api/auth/register" : "/api/auth/login";
  const body = registerMode
    ? { name: nameInput.value.trim(), email: emailInput.value.trim(), password: passwordInput.value }
    : { email: emailInput.value.trim(), password: passwordInput.value };
  try {
    if (registerMode && passwordInput.value !== confirmPasswordInput.value) {
      throw new Error("Passwords do not match");
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Authentication failed");
    authForm.reset();
    showLoggedIn(data.user);
  } catch (error) {
    showMessage(error.message, "error");
  }
});

document.querySelectorAll(".password-toggle").forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const input = document.querySelector(`#${toggle.dataset.passwordTarget}`);
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    toggle.setAttribute("aria-label", `${visible ? "Show" : "Hide"} ${input.id === "confirm-password" ? "confirmation password" : "password"}`);
    toggle.setAttribute("aria-pressed", String(!visible));
  });
});

document.querySelector("#logout").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error("Could not sign out");
    showLoggedOut();
    showMessage("You have been signed out.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

async function restoreSession() {
  try {
    const response = await fetch("/api/auth/me");
    if (response.status === 401) return showLoggedOut();
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not restore session");
    showLoggedIn(data.user);
  } catch (error) {
    showMessage(error.message, "error");
  }
}

updateAuthMode();
restoreSession();
