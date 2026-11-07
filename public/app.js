const student = document.querySelector("#student");
const form = document.querySelector("#request-form");
const requests = document.querySelector("#requests");
const message = document.querySelector("#message");

function showMessage(text, kind = "") {
  message.textContent = text;
  message.className = kind;
}

function renderRequests(items) {
  if (!items.length) {
    requests.innerHTML = '<p class="empty">No requests yet for this student.</p>';
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
    const response = await fetch(`/api/advising-requests?student_id=${encodeURIComponent(student.value)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load requests");
    renderRequests(data);
  } catch (error) {
    requests.innerHTML = "";
    showMessage(error.message, "error");
  }
}

student.addEventListener("change", loadRequests);
document.querySelector("#refresh").addEventListener("click", loadRequests);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("Submitting...");
  try {
    const response = await fetch("/api/advising-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: student.value,
        agenda: document.querySelector("#agenda").value.trim(),
        preferred_date: document.querySelector("#date").value,
        preferred_time: document.querySelector("#time").value.trim()
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not submit request");
    form.reset();
    showMessage("Request submitted successfully.", "success");
    await loadRequests();
  } catch (error) {
    showMessage(error.message, "error");
  }
});

loadRequests();
