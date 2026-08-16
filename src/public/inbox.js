function apiFetch(url, options) {
  options = options || {};
  options.headers = Object.assign({ "X-Requested-With": "XMLHttpRequest" }, options.headers || {});
  return fetch(url, options).then((res) => {
    if (res.status === 401) {
      showToast("Tu sesión expiró. Recargando...");
      setTimeout(() => (location.href = "/login"), 1500);
      throw new Error("unauthenticated");
    }
    return res;
  });
}

let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
}

function showConfirm(message, onConfirm) {
  const modal = document.getElementById("modal-confirm");
  const msgEl = document.getElementById("confirm-message");
  const yesBtn = document.getElementById("confirm-yes");
  const noBtn = document.getElementById("confirm-no");
  msgEl.textContent = message;
  modal.classList.remove("hidden");

  function cleanup() {
    modal.classList.add("hidden");
    yesBtn.removeEventListener("click", onYes);
    noBtn.removeEventListener("click", onNo);
  }
  function onYes() {
    cleanup();
    onConfirm();
  }
  function onNo() {
    cleanup();
  }
  yesBtn.addEventListener("click", onYes);
  noBtn.addEventListener("click", onNo);
}

document.addEventListener("DOMContentLoaded", () => {
  const emailAccountId = location.pathname.split("/")[2];

  const btnRefreshInbox = document.getElementById("btn-refresh-inbox");
  if (btnRefreshInbox) {
    btnRefreshInbox.addEventListener("click", () => {
      btnRefreshInbox.classList.add("loading");
      location.reload();
    });
  }

  const messageSearch = document.getElementById("message-search");
  if (messageSearch) {
    messageSearch.addEventListener("input", () => {
      const query = messageSearch.value.trim().toLowerCase();
      document.querySelectorAll(".list-row").forEach((row) => {
        const subject = (row.dataset.subject || "").toLowerCase();
        const from = (row.dataset.from || "").toLowerCase();
        row.style.display = !query || subject.includes(query) || from.includes(query) ? "" : "none";
      });
    });
  }

  document.querySelectorAll(".btn-toggle-seen").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".list-row");
      const uid = row.dataset.uid;
      const newSeen = btn.dataset.seen === "1" ? "0" : "1";
      apiFetch(`/inbox/${emailAccountId}/message/${uid}/seen`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `seen=${newSeen}`,
      })
        .then((r) => r.json())
        .then((data) => {
          btn.dataset.seen = newSeen;
          btn.title = data.seen ? "Marcar como no leído" : "Marcar como leído";
          row.classList.toggle("unread", !data.seen);
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo actualizar.");
        });
    });
  });

  // Confirmación propia (en vez del confirm() nativo del navegador) para borrar un mensaje.
  document.querySelectorAll(".form-confirm").forEach((form) => {
    form.addEventListener("submit", (e) => {
      if (form.dataset.confirmed) return;
      e.preventDefault();
      showConfirm(form.dataset.confirmMessage, () => {
        form.dataset.confirmed = "1";
        form.submit();
      });
    });
  });
});
