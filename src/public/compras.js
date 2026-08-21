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
  const modalAdd = document.getElementById("modal-add-email");
  const modalEdit = document.getElementById("modal-edit-email");
  const btnAdd = document.getElementById("btn-add-email");
  const addEmailField = document.getElementById("add-email-field");
  const formAddEmail = document.getElementById("form-add-email");
  const editEmailField = document.getElementById("edit-email-field");
  const formEditEmail = document.getElementById("form-edit-email");

  document.querySelectorAll(".btn-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      modalAdd.classList.add("hidden");
      modalEdit.classList.add("hidden");
    });
  });

  if (btnAdd) {
    btnAdd.addEventListener("click", () => {
      addEmailField.value = "";
      modalAdd.classList.remove("hidden");
      addEmailField.focus();
    });
  }

  if (formAddEmail) {
    formAddEmail.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = addEmailField.value.trim();
      if (!email) return;
      apiFetch("/compras/emails", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `email=${encodeURIComponent(email)}`,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            showToast(data.error);
            return;
          }
          location.reload();
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo agregar el correo.");
        });
    });
  }

  document.querySelectorAll(".btn-edit-email").forEach((btn) => {
    btn.addEventListener("click", () => {
      formEditEmail.dataset.id = btn.dataset.id;
      editEmailField.value = btn.dataset.email;
      modalEdit.classList.remove("hidden");
      editEmailField.focus();
    });
  });

  if (formEditEmail) {
    formEditEmail.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = formEditEmail.dataset.id;
      const email = editEmailField.value.trim();
      if (!email) return;
      apiFetch(`/compras/emails/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `email=${encodeURIComponent(email)}`,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            showToast(data.error);
            return;
          }
          location.reload();
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo guardar el correo.");
        });
    });
  }

  document.querySelectorAll(".btn-delete-email").forEach((btn) => {
    btn.addEventListener("click", () => {
      showConfirm(`¿Eliminar ${btn.dataset.email}?`, () => {
        apiFetch(`/compras/emails/${btn.dataset.id}/delete`, { method: "POST" })
          .then((r) => r.json())
          .then(() => {
            const row = btn.closest(".email-row");
            if (row) row.remove();
            showToast("Correo eliminado");
          })
          .catch((err) => {
            if (err.message !== "unauthenticated") showToast("No se pudo eliminar el correo.");
          });
      });
    });
  });
});
