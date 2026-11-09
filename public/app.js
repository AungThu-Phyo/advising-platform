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
const userBar = document.querySelector("#user-bar");
const studentPartnerData = document.querySelector("#student-partner-data");
const dateInput = document.querySelector("#date");
const timeInput = document.querySelector("#time");
const availabilityMessage = document.querySelector("#availability-message");
const studentContent = document.querySelector("#app-panel > .grid");
const advisorPanel = document.querySelector("#advisor-panel");
const advisorRequests = document.querySelector("#advisor-requests");
const statusFilter = document.querySelector("#status-filter");
const advisorNotification = document.querySelector("#advisor-notification");
const form = document.querySelector("#request-form");
const requests = document.querySelector("#requests");
const message = document.querySelector("#message");
const lecturerLookupForm = document.querySelector("#lecturer-lookup-form");
const lecturerUidInput = document.querySelector("#lecturer-uid");
const lecturerResult = document.querySelector("#lecturer-result");
const loadPartnerLecturersButton = document.querySelector("#load-partner-lecturers");
const partnerLecturers = document.querySelector("#partner-lecturers");
let registerMode = false;
let currentUser = null;
let advisorRequestIds = null;
let advisorPollingTimer = null;

function renderLecturerResult(payload) {
  const lecturer = payload?.data?.data || payload?.data || {};
  const reviews = Array.isArray(lecturer.reviews) ? lecturer.reviews : [];
  const summary = lecturer.reviewSummary;
  lecturerResult.className = "partner-result";
  lecturerResult.innerHTML = `
    <div class="partner-profile">
      <div>
        <h3>${escapeHtml(lecturer.name || "Unnamed lecturer")}</h3>
        <p class="muted">${escapeHtml(lecturer.uid || "")} · ${escapeHtml(lecturer.title || "Title not provided")}</p>
      </div>
      <span class="status">${escapeHtml(lecturer.schoolName || "School not provided")}</span>
    </div>
    <dl class="profile-details">
      <div><dt>Department</dt><dd>${escapeHtml(lecturer.department || "Not provided")}</dd></div>
      <div><dt>Office</dt><dd>${escapeHtml(lecturer.office || "Not provided")}</dd></div>
      <div><dt>Email</dt><dd>${escapeHtml(lecturer.email || "Not provided")}</dd></div>
    </dl>
    ${summary ? `<div class="review-summary"><strong>Review summary</strong><span>Average: ${escapeHtml(summary.average ?? "—")} · ${escapeHtml(summary.count ?? 0)} reviews</span></div>` : ""}
    ${reviews.length ? `<div class="reviews"><strong>Reviews</strong>${reviews.map((review) => `
      <article class="review">
        <div class="review-top"><span>${escapeHtml(review.author || "Anonymous")}</span><small>${escapeHtml(review.comment || "No comment")}</small></div>
        <span class="muted">${escapeHtml(review.createdAtMillis || "")}</span>
      </article>
    `).join("")}</div>` : '<p class="empty">No reviews provided.</p>'}
  `;
}

lecturerLookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const uid = lecturerUidInput.value.trim();
  if (!uid) return;
  lecturerResult.className = "partner-result empty";
  lecturerResult.textContent = "Retrieving live lecturer data...";
  try {
    const response = await fetch(`/api/campus-insights/lecturers/by-uid/${encodeURIComponent(uid)}`);
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.error || "Could not retrieve lecturer data");
    renderLecturerResult(payload);
  } catch (error) {
    lecturerResult.className = "partner-result error";
    lecturerResult.textContent = error.message;
  }
});

function renderPartnerLecturers(items) {
  partnerLecturers.innerHTML = items.length
    ? items.map((item) => `
      <article class="partner-lecturer-card">
        <div class="partner-profile">
          <div>
            <h3>${escapeHtml(item.name || "Unnamed lecturer")}</h3>
            <p class="muted">${escapeHtml(item.uid)} · ${escapeHtml(item.title || "Title not provided")}</p>
          </div>
          <span class="status">${escapeHtml(item.schoolName || "School not provided")}</span>
        </div>
        <dl class="profile-details">
          <div><dt>Department</dt><dd>${escapeHtml(item.department || "Not provided")}</dd></div>
          <div><dt>Office</dt><dd>${escapeHtml(item.office || "Not provided")}</dd></div>
          <div><dt>Email</dt><dd>${escapeHtml(item.email || "Not provided")}</dd></div>
        </dl>
        ${item.reviewSummary ? `<p class="review-summary"><strong>Reviews</strong><span>Average: ${escapeHtml(item.reviewSummary.average ?? "—")} · ${escapeHtml(item.reviewSummary.count ?? 0)} reviews</span></p>` : ""}
      </article>
    `).join("")
    : '<p class="empty">No partner lecturer records were returned.</p>';
}

loadPartnerLecturersButton.addEventListener("click", async () => {
  loadPartnerLecturersButton.disabled = true;
  partnerLecturers.innerHTML = '<p class="empty">Loading live Campus Insights lecturer data...</p>';
  try {
    const schoolsResponse = await fetch("/api/schools");
    const schools = await schoolsResponse.json();
    if (!schoolsResponse.ok || !Array.isArray(schools)) throw new Error("Could not load lecturer directory");
    const schoolLecturers = await Promise.all(schools.map(async (school) => {
      const response = await fetch(`/api/schools/${encodeURIComponent(school.schoolId)}/lecturers`);
      const data = await response.json();
      if (!response.ok || !Array.isArray(data)) throw new Error("Could not load lecturer directory");
      return data;
    }));
    const records = [];
    for (const lecturer of schoolLecturers.flat()) {
      const response = await fetch(`/api/campus-insights/lecturers/by-uid/${encodeURIComponent(lecturer.uid)}`);
      const payload = await response.json();
      if (response.ok && payload.success) {
        records.push(payload.data?.data || payload.data);
      }
    }
    renderPartnerLecturers(records.filter(Boolean));
  } catch (error) {
    partnerLecturers.innerHTML = "";
    showMessage(error.message, "error");
  } finally {
    loadPartnerLecturersButton.disabled = false;
  }
});

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
      <p><strong>Student:</strong> ${escapeHtml(item.student_name || item.student_email || "Unknown student")}</p>
      ${item.student_name && item.student_email ? `<small>${escapeHtml(item.student_email)}</small>` : ""}
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

async function loadAdvisorRequests({ notify = true } = {}) {
  if (!advisorRequestIds) advisorRequests.innerHTML = '<p class="empty">Loading requests...</p>';
  try {
    const response = await fetch("/api/advising-requests");
    const data = await response.json();
    if (response.status === 401) return showLoggedOut("Your session has expired. Please sign in again.");
    if (!response.ok) throw new Error(data.error || "Could not load advisor requests");
    const currentIds = new Set(data.map((item) => item.id));
    const newPendingCount = advisorRequestIds
      ? data.filter((item) => item.status === "pending" && !advisorRequestIds.has(item.id)).length
      : 0;
    if (notify && newPendingCount > 0) {
      advisorNotification.textContent = `${newPendingCount} new advising request${newPendingCount === 1 ? "" : "s"} received.`;
      advisorNotification.classList.remove("hidden");
    }
    advisorRequestIds = currentIds;
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
  await loadAdvisorRequests({ notify: false });
});

statusFilter.addEventListener("change", loadAdvisorRequests);
document.querySelector("#advisor-refresh").addEventListener("click", () => loadAdvisorRequests({ notify: false }));

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
  advisorRequestIds = null;
  if (advisorPollingTimer) clearInterval(advisorPollingTimer);
  advisorPollingTimer = null;
  authPanel.classList.remove("hidden");
  appPanel.classList.add("hidden");
  userBar.classList.add("hidden");
  studentPartnerData.classList.add("hidden");
  document.querySelector("header .eyebrow").textContent = "Student portal";
  document.querySelector("header .intro").textContent = "Sign in to view and submit your advising requests.";
  if (text) showMessage(text, "error");
}

function showLoggedIn(user) {
  currentUser = user;
  advisorRequestIds = null;
  advisorNotification.classList.add("hidden");
  authPanel.classList.add("hidden");
  appPanel.classList.remove("hidden");
  userBar.classList.remove("hidden");
  userName.textContent = user.name;
  userEmail.textContent = user.email;
  showMessage("");
  const isAdvisor = user.role === "ADVISOR" || user.role === "ADMIN";
  document.querySelector("header .eyebrow").textContent = isAdvisor ? "Advisor portal" : "Student portal";
  document.querySelector("header .intro").textContent = isAdvisor ? "Review and decide advising requests." : "Submit an advising request and track your requests.";
  studentContent.classList.toggle("hidden", isAdvisor);
  studentPartnerData.classList.toggle("hidden", isAdvisor);
  advisorPanel.classList.toggle("hidden", !isAdvisor);
  if (isAdvisor) loadAdvisorRequests();
  else {
    loadRequests();
  }
  if (advisorPollingTimer) clearInterval(advisorPollingTimer);
  advisorPollingTimer = isAdvisor
    ? setInterval(() => loadAdvisorRequests(), 10000)
    : null;
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
  if (!window.confirm("Are you sure you want to sign out?")) return;
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
