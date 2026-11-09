const authPanel = document.querySelector("#auth-panel");
const appPanel = document.querySelector("#app-panel");
const authHero = document.querySelector("#auth-hero");
const headerIntro = document.querySelector("#header-intro");
const themeToggle = document.querySelector("#theme-toggle");
const platformDetails = document.querySelector("#platform-details");
const explorePlatform = document.querySelector("#explore-platform");
const authForm = document.querySelector("#auth-form");
const authTitle = document.querySelector("#auth-title");
const authDescription = document.querySelector("#auth-description");
const authToggle = document.querySelector("#auth-toggle");
const authRoleSwitch = document.querySelector("#auth-role-switch");
const studentModeToggle = document.querySelector("#student-mode-toggle");
const advisorModeToggle = document.querySelector("#advisor-mode-toggle");
const advisorSetupToggle = document.querySelector("#advisor-setup-toggle");
const advisorDemoNote = document.querySelector("#advisor-demo-note");
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
const assignedAdvisor = document.querySelector("#assigned-advisor");
const dateInput = document.querySelector("#date");
const timeInput = document.querySelector("#time");
const availabilityMessage = document.querySelector("#availability-message");
const studentContent = document.querySelector("#app-panel > .grid");
const advisorPanel = document.querySelector("#advisor-panel");
const advisorRequests = document.querySelector("#advisor-requests");
const statusFilter = document.querySelector("#status-filter");
const advisorNotification = document.querySelector("#advisor-notification");
const advisorStats = document.querySelector("#advisor-stats");
const availabilityChart = document.querySelector("#availability-chart");
const weeklyHoursLabel = document.querySelector("#weekly-hours");
const weeklyAvailabilityForm = document.querySelector("#weekly-availability-form");
const advisorProfileForm = document.querySelector("#advisor-profile-form");
const advisorProfileName = document.querySelector("#advisor-profile-name");
const advisorProfileEmail = document.querySelector("#advisor-profile-email");
const advisorProfileDepartment = document.querySelector("#advisor-profile-department");
const advisorProfileOffice = document.querySelector("#advisor-profile-office");
const advisorFirstName = document.querySelector("#advisor-first-name");
const userAvatar = document.querySelector("#user-avatar");
const form = document.querySelector("#request-form");
const requests = document.querySelector("#requests");
const message = document.querySelector("#message");
const lecturerLookupForm = document.querySelector("#lecturer-lookup-form");
const lecturerUidInput = document.querySelector("#lecturer-uid");
const lecturerResult = document.querySelector("#lecturer-result");
const loadPartnerLecturersButton = document.querySelector("#load-partner-lecturers");
const partnerLecturers = document.querySelector("#partner-lecturers");
let registerMode = false;
let advisorMode = false;
let advisorSetupMode = false;
let currentUser = null;
let advisorRequestIds = null;
let advisorPollingTimer = null;
let advisorProfile = null;

const UI_ICONS = {
  requests: '<svg viewBox="0 0 24 24"><path d="M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2Z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  pending: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  approved: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
  hours: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h3M8 17h7"/></svg>',
  declined: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>',
};

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("campus-advising-theme", theme);
  const dark = theme === "dark";
  themeToggle.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} theme`);
  themeToggle.innerHTML = dark
    ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M20.5 15.2A8.7 8.7 0 0 1 8.8 3.5 8.8 8.8 0 1 0 20.5 15.2Z"/></svg>';
}

setTheme(localStorage.getItem("campus-advising-theme") === "dark" ? "dark" : "light");
themeToggle.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
explorePlatform.addEventListener("click", () => {
  const expanded = explorePlatform.getAttribute("aria-expanded") === "true";
  explorePlatform.setAttribute("aria-expanded", String(!expanded));
  platformDetails.classList.toggle("hidden", expanded);
  explorePlatform.innerHTML = expanded ? 'Explore how it works <span>→</span>' : 'Close overview <span>↑</span>';
});

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
      <button type="button" class="assign-advisor" data-lecturer-uid="${escapeHtml(lecturer.uid || lecturerUidInput.value.trim())}">Choose as my advisor</button>
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

lecturerResult.addEventListener("click", async (event) => {
  const button = event.target.closest(".assign-advisor");
  if (!button) return;
  button.disabled = true;
  button.textContent = "Assigning...";
  try {
    const response = await fetch("/api/student/advisor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lecturerUid: button.dataset.lecturerUid })
    });
    const data = await response.json();
    if (response.status === 401) return showLoggedOut("Your session has expired. Please sign in again.");
    if (!response.ok) throw new Error(data.error || "Could not assign advisor");
    button.textContent = "Advisor assigned";
    button.classList.add("assigned");
    await loadStudentAdvisor();
    showMessage(`Advisor assigned: ${data.advisorEmail}. Your request will be sent to this advisor.`, "success");
    await loadAvailability();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Choose as my advisor";
    showMessage(error.message, "error");
  }
});

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

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function durationHours(slot) {
  const [startHour, startMinute] = slot.start_time.split(":").map(Number);
  const [endHour, endMinute] = slot.end_time.split(":").map(Number);
  return (endHour * 60 + endMinute - startHour * 60 - startMinute) / 60;
}

function renderAvailabilityChart(slots) {
  const byDay = WEEKDAY_NAMES.map((name, day) => ({
    name,
    slots: slots.filter((slot) => Number(slot.day_of_week) === day),
  }));
  const totals = byDay.map((day) => day.slots.reduce((sum, slot) => sum + durationHours(slot), 0));
  const maxHours = Math.max(4, ...totals);
  const totalHours = totals.reduce((sum, hours) => sum + hours, 0);
  weeklyHoursLabel.textContent = `${totalHours.toFixed(1).replace(/\.0$/, "")} hrs / week`;
  availabilityChart.innerHTML = slots.length ? byDay.map((day, index) => {
    const hours = totals[index];
    const ranges = day.slots.map((slot) => `${escapeHtml(slot.start_time)}–${escapeHtml(slot.end_time)}`).join(", ");
    return `<div class="availability-row">
      <span class="availability-day">${day.name.slice(0, 3)}</span>
      <div class="availability-track" role="img" aria-label="${day.name}: ${hours.toFixed(1)} free hours">
        <span class="availability-bar" style="--bar-width:${Math.max(0, Math.min(100, hours / maxHours * 100))}%"></span>
      </div>
      <span class="availability-hours">${hours ? `${hours.toFixed(1).replace(/\.0$/, "")}h` : "—"}</span>
      ${day.slots.length ? `<div class="availability-ranges">${ranges}</div><div class="availability-remove-list">${day.slots.map((slot) => `<button type="button" class="remove-availability" data-slot-id="${Number(slot.id)}" aria-label="Remove ${day.name} ${escapeHtml(slot.start_time)} to ${escapeHtml(slot.end_time)}">Remove</button>`).join("")}</div>` : '<div class="availability-ranges empty">No free time</div>'}
    </div>`;
  }).join("") : '<p class="empty chart-empty">No weekly free time set yet. Add a recurring time below to let students request a meeting.</p>';
}

async function loadAdvisorDashboard() {
  try {
    const response = await fetch("/api/advisor/dashboard");
    const data = await response.json();
    if (response.status === 401) return showLoggedOut("Your session has expired. Please sign in again.");
    if (!response.ok) throw new Error(data.error || "Could not load advisor dashboard");
    advisorProfile = data.profile;
    advisorProfileName.value = advisorProfile.name || "";
    advisorProfileEmail.value = advisorProfile.email || "";
    advisorProfileDepartment.value = advisorProfile.department || "";
    advisorProfileOffice.value = advisorProfile.office || "";
    const firstName = (advisorProfile.name || "Advisor").replace(/^(Dr\.?|Ms\.?|Mr\.?|Mrs\.?)\s+/i, "").split(/\s+/)[0];
    advisorFirstName.textContent = firstName;
    userName.textContent = advisorProfile.name || currentUser?.name || "Advisor";
    userAvatar.textContent = (advisorProfile.name || currentUser?.name || "A").trim().slice(0, 1).toUpperCase();

    const stats = data.stats || {};
    const weeklyHours = (data.weeklyAvailability || []).reduce((sum, slot) => sum + durationHours(slot), 0);
    const cards = [
      ["requests", "Total requests", stats.total ?? 0],
      ["pending", "Needs review", stats.pending ?? 0],
      ["approved", "Approved", stats.approved ?? 0],
      ["declined", "Declined", stats.declined ?? 0],
      ["hours", "Free hours / week", `${weeklyHours.toFixed(1).replace(/\.0$/, "")}h`],
    ];
    advisorStats.innerHTML = cards.map(([iconName, label, value]) => `<article class="stat-card">
      <span class="stat-icon">${UI_ICONS[iconName]}</span><span class="stat-label">${label}</span><strong>${escapeHtml(value)}</strong>
    </article>`).join("");
    renderAvailabilityChart(data.weeklyAvailability || []);
  } catch (error) {
    showMessage(error.message, "error");
  }
}

weeklyAvailabilityForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!advisorProfile) return;
  const submit = weeklyAvailabilityForm.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    const response = await fetch(`/api/lecturers/${encodeURIComponent(advisorProfile.uid)}/availability/weekly`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schoolId: advisorProfile.school_id,
        dayOfWeek: Number(document.querySelector("#availability-day").value),
        startTime: document.querySelector("#availability-start").value,
        endTime: document.querySelector("#availability-end").value,
        timezone: "Asia/Bangkok",
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not add free time");
    showMessage("Weekly free time added.", "success");
    await loadAdvisorDashboard();
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    submit.disabled = false;
  }
});

availabilityChart.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-slot-id]");
  if (!button || !advisorProfile) return;
  button.disabled = true;
  try {
    const response = await fetch(`/api/lecturers/${encodeURIComponent(advisorProfile.uid)}/availability/weekly/${button.dataset.slotId}`, { method: "DELETE" });
    const data = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(data.error || "Could not remove free time");
    await loadAdvisorDashboard();
  } catch (error) {
    button.disabled = false;
    showMessage(error.message, "error");
  }
});

advisorProfileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = advisorProfileForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const response = await fetch("/api/advisor/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: advisorProfileName.value.trim(),
        department: advisorProfileDepartment.value.trim(),
        office: advisorProfileOffice.value.trim(),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not save profile");
    showMessage("Profile settings saved.", "success");
    await loadAdvisorDashboard();
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

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
    await loadAdvisorDashboard();
});

statusFilter.addEventListener("change", loadAdvisorRequests);
document.querySelector("#advisor-refresh").addEventListener("click", () => loadAdvisorRequests({ notify: false }));

async function loadAvailability() {
  if (!dateInput.value) {
    timeInput.disabled = true;
    timeInput.innerHTML = '<option value="">Select a date first</option>';
    availabilityMessage.textContent = "Choose a date to load suggested request times.";
    return;
  }
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
    availabilityMessage.textContent = data.fallback
      ? "These are suggested request times. Your request will be sent as pending; the advisor will confirm the time."
      : "Availability supplied by Campus Insights.";
  } catch (error) {
    timeInput.innerHTML = '<option value="">Availability unavailable</option>';
    availabilityMessage.textContent = error.message;
  }
}

async function loadStudentAdvisor() {
  assignedAdvisor.innerHTML = '<h2>Your advisor</h2><p class="empty">Loading advisor assignment...</p>';
  try {
    const response = await fetch("/api/student/advisor");
    const data = await response.json();
    if (response.status === 401) return showLoggedOut("Your session has expired. Please sign in again.");
    if (response.status === 503 && !data.advisorEmail) {
      assignedAdvisor.innerHTML = '<h2>Your advisor</h2><p class="empty">No advisor assigned yet. Find a lecturer above and choose them as your advisor.</p>';
      return;
    }
    if (!response.ok) throw new Error(data.error || "Could not load advisor assignment");
    const profile = data.profile?.data?.data || data.profile?.data || {};
    assignedAdvisor.innerHTML = `<h2>Your advisor</h2><p><strong>${escapeHtml(profile.name || data.advisorEmail)}</strong></p><p>${escapeHtml(data.advisorEmail)}</p>${profile.department ? `<p class="muted">${escapeHtml(profile.department)}</p>` : ""}`;
  } catch (error) {
    assignedAdvisor.innerHTML = `<h2>Your advisor</h2><p class="error">${escapeHtml(error.message)}</p>`;
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
    showMessage(`Request submitted with pending status${data.advisor_email ? ` for ${data.advisor_email}` : ""}.`, "success");
    await loadRequests();
  } catch (error) {
    showMessage(error.message, "error");
  }
});

function showLoggedOut(text = "") {
  currentUser = null;
  advisorProfile = null;
  advisorMode = false;
  advisorSetupMode = false;
  registerMode = false;
  advisorRequestIds = null;
  if (advisorPollingTimer) clearInterval(advisorPollingTimer);
  advisorPollingTimer = null;
  authPanel.classList.remove("hidden");
  authHero.classList.remove("hidden");
  appPanel.classList.add("hidden");
  userBar.classList.add("hidden");
  headerIntro.classList.add("hidden");
  studentPartnerData.classList.add("hidden");
  updateAuthMode();
  if (text) showMessage(text, "error");
}

function showLoggedIn(user) {
  currentUser = user;
  advisorRequestIds = null;
  advisorNotification.classList.add("hidden");
  authPanel.classList.add("hidden");
  authHero.classList.add("hidden");
  appPanel.classList.remove("hidden");
  userBar.classList.remove("hidden");
  headerIntro.classList.remove("hidden");
  userName.textContent = user.name;
  userEmail.textContent = user.email;
  userAvatar.textContent = (user.name || user.email || "A").trim().slice(0, 1).toUpperCase();
  showMessage("");
  const isAdvisor = user.role === "ADVISOR" || user.role === "ADMIN";
  headerIntro.textContent = isAdvisor ? "Your advisor workspace" : "Your student advising workspace";
  studentContent.classList.toggle("hidden", isAdvisor);
  studentPartnerData.classList.toggle("hidden", isAdvisor);
  advisorPanel.classList.toggle("hidden", !isAdvisor);
  updateAuthMode();
  if (isAdvisor) {
    loadAdvisorDashboard();
    loadAdvisorRequests();
  }
  else {
    loadStudentAdvisor();
    loadRequests();
    if (dateInput.value) loadAvailability();
  }
  if (advisorPollingTimer) clearInterval(advisorPollingTimer);
  advisorPollingTimer = isAdvisor
    ? setInterval(() => { loadAdvisorRequests(); loadAdvisorDashboard(); }, 20000)
    : null;
}

function updateAuthMode() {
  authTitle.textContent = advisorSetupMode ? "Set up advisor password" : advisorMode ? "Advisor sign in" : registerMode ? "Create account" : "Sign in";
  authDescription.textContent = registerMode
    ? "Create a student account to submit and track advising requests."
    : advisorSetupMode ? "Choose a personal password for your active mock lecturer account."
      : advisorMode ? "Sign in with your lecturer email and password."
    : "Sign in to view and submit your advising requests.";
  authToggle.textContent = registerMode ? "Back to sign in" : "Create account";
  authToggle.classList.toggle("hidden", advisorMode || advisorSetupMode);
  authSubmit.textContent = advisorSetupMode ? "Set password and continue" : advisorMode ? "Sign in to advisor dashboard" : registerMode ? "Register" : "Sign in";
  nameField.classList.toggle("hidden", !registerMode || advisorMode);
  confirmPasswordField.classList.toggle("hidden", !registerMode && !advisorSetupMode);
  passwordInput.closest(".password-field").classList.remove("hidden");
  passwordInput.closest(".password-field").previousElementSibling.classList.remove("hidden");
  nameInput.required = registerMode && !advisorMode;
  confirmPasswordInput.required = (registerMode && !advisorMode) || advisorSetupMode;
  passwordInput.required = true;
  passwordInput.autocomplete = registerMode || advisorSetupMode ? "new-password" : "current-password";
  authRoleSwitch.classList.toggle("hidden", registerMode || advisorSetupMode);
  studentModeToggle.classList.toggle("active", !advisorMode);
  studentModeToggle.setAttribute("aria-pressed", String(!advisorMode));
  advisorModeToggle.classList.toggle("active", advisorMode);
  advisorModeToggle.setAttribute("aria-pressed", String(advisorMode));
  advisorSetupToggle.classList.toggle("hidden", !advisorMode);
  advisorSetupToggle.textContent = advisorSetupMode ? "Back to advisor sign in" : "First time here? Set up your advisor password";
  advisorDemoNote.classList.toggle("hidden", !advisorSetupMode);
}

authToggle.addEventListener("click", () => {
  advisorMode = false;
  advisorSetupMode = false;
  registerMode = !registerMode;
  authForm.reset();
  updateAuthMode();
});

studentModeToggle.addEventListener("click", () => {
  advisorMode = false;
  advisorSetupMode = false;
  registerMode = false;
  authForm.reset();
  updateAuthMode();
});

advisorModeToggle.addEventListener("click", () => {
  advisorMode = true;
  advisorSetupMode = false;
  registerMode = false;
  authForm.reset();
  updateAuthMode();
});

advisorSetupToggle.addEventListener("click", () => {
  advisorSetupMode = !advisorSetupMode;
  authForm.reset();
  updateAuthMode();
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authSubmit.disabled = true;
  showMessage(advisorSetupMode ? "Setting up advisor password..." : advisorMode ? "Checking lecturer access..." : registerMode ? "Creating account..." : "Signing in...");
  const endpoint = advisorSetupMode ? "/api/auth/advisor-setup" : advisorMode ? "/api/auth/advisor-login" : registerMode ? "/api/auth/register" : "/api/auth/login";
  const body = advisorMode
    ? { email: emailInput.value.trim(), password: passwordInput.value }
    : registerMode
    ? { name: nameInput.value.trim(), email: emailInput.value.trim(), password: passwordInput.value }
    : { email: emailInput.value.trim(), password: passwordInput.value };
  try {
    if ((registerMode || advisorSetupMode) && passwordInput.value !== confirmPasswordInput.value) {
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
  } finally {
    authSubmit.disabled = false;
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
