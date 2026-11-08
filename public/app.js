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
const advisor = document.querySelector("#advisor");
const dateInput = document.querySelector("#date");
const timeInput = document.querySelector("#time");
const availabilityMessage = document.querySelector("#availability-message");
const studentContent = document.querySelector("#app-panel > .grid");
const advisorPanel = document.querySelector("#advisor-panel");
const advisorRequests = document.querySelector("#advisor-requests");
const statusFilter = document.querySelector("#status-filter");
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

function renderAdvisorRequests(items) {
  const filtered = statusFilter.value ? items.filter((item) => item.status === statusFilter.value) : items;
  advisorRequests.innerHTML = filtered.length ? filtered.map((item) => `
    <article class="request">
      <div class="request-top">
        <strong>Request #${item.id}</strong>
        <span class="status">${escapeHtml(item.status)}</span>
      </div>
      <p><strong>Student:</strong> ${escapeHtml(item.student_id)}</p>
      <p>${escapeHtml(item.agenda)}</p>
      <small>${escapeHtml(item.preferred_date)} · ${escapeHtml(item.preferred_time)}</small>
      ${item.decision_note ? `<p class="decision-note"><strong>Decision note:</strong> ${escapeHtml(item.decision_note)}</p>` : ""}
      ${item.status === "pending" ? `<div class="decision-actions">
        <button type="button" data-decision="approved" data-request-id="${item.id}">Approve</button>
        <button type="button" class="danger" data-decision="rejected" data-request-id="${item.id}">Reject</button>
      </div>` : ""}
    </article>
  `).join("") : '<p class="empty">No requests match this filter.</p>';
}

async function loadAdvisorRequests() {
  advisorRequests.innerHTML = '<p class="empty">Loading requests...</p>';
  try {
    const response = await fetch("/api/advising-requests");
    const data = await response.json();
    if (response.status === 401) return showLoggedOut("Your session has expired. Please sign in again.");
    if (!response.ok) throw new Error(data.error || "Could not load advisor requests");
    renderAdvisorRequests(data);
  } catch (error) {
    advisorRequests.innerHTML = "";
    showMessage(error.message, "error");
  }
}

advisorRequests.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-decision]");
  if (!button) return;
  const note = window.prompt(`Add a note for this ${button.dataset.decision} decision:`);
  if (!note || !note.trim()) return;
  const response = await fetch(`/api/advising-requests/${button.dataset.requestId}/decision`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: button.dataset.decision, decision_note: note.trim() })
  });
  const data = await response.json();
  if (!response.ok) return showMessage(data.error || "Could not save decision", "error");
  showMessage("Decision saved.", "success");
  loadAdvisorRequests();
});

statusFilter.addEventListener("change", loadAdvisorRequests);
document.querySelector("#advisor-refresh").addEventListener("click", loadAdvisorRequests);

async function loadAdvisor() {
  advisor.textContent = "Loading advisor information...";
  try {
    const response = await fetch("/api/student/advisor");
    const data = await response.json();
    if (response.status === 401) return showLoggedOut("Your session has expired. Please sign in again.");
    if (!response.ok) throw new Error(data.error || "Could not load advisor information");
    const profile = data.profile?.data?.data || data.profile?.data || {};
    advisor.innerHTML = `<strong>${escapeHtml(profile.name || data.advisorEmail)}</strong>
      <span>${escapeHtml(profile.school || profile.major || data.advisorEmail)}</span>`;
  } catch (error) {
    advisor.textContent = error.message;
    advisor.className = "error";
  }
}

async function loadAvailability() {
  timeInput.disabled = true;
  timeInput.innerHTML = '<option value="">Loading available slots...</option>';
  availabilityMessage.textContent = "";
  try {
    const response = await fetch(`/api/student/advisor/availability?date=${encodeURIComponent(dateInput.value)}`);
    const data = await response.json();
    if (response.status === 401) return showLoggedOut("Your session has expired. Please sign in again.");
    if (!response.ok) throw new Error(data.error || "Could not load availability");
    const slots = Array.isArray(data.slots) ? data.slots : Array.isArray(data.data) ? data.data : [];
    timeInput.innerHTML = slots.length
      ? '<option value="">Select an available slot</option>' + slots.map((slot) => `<option value="${escapeHtml(slot.time)}">${escapeHtml(slot.time)}</option>`).join("")
      : '<option value="">No available slots</option>';
    timeInput.disabled = !slots.length;
    availabilityMessage.textContent = data.fallback ? "Demo availability is shown because partner availability is not configured." : "Availability supplied by Campus Insights.";
  } catch (error) {
    timeInput.innerHTML = '<option value="">Availability unavailable</option>';
    availabilityMessage.textContent = error.message;
  }
}

document.querySelector("#refresh").addEventListener("click", loadRequests);
dateInput.addEventListener("change", loadAvailability);
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
  const isAdvisor = user.role === "ADVISOR" || user.role === "ADMIN";
  document.querySelector("header .eyebrow").textContent = isAdvisor ? "Advisor portal" : "Student portal";
  document.querySelector("header .intro").textContent = isAdvisor ? "Review and decide advising requests." : "Submit an advising request and track your requests.";
  studentContent.classList.toggle("hidden", isAdvisor);
  advisorPanel.classList.toggle("hidden", !isAdvisor);
  if (isAdvisor) loadAdvisorRequests();
  else {
    loadAdvisor();
    loadRequests();
  }
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
