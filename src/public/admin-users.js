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
  const modal = document.getElementById("modal-edit-user");
  const label = document.getElementById("edit-user-label");
  const passwordField = document.getElementById("edit-user-password-field");
  const form = document.getElementById("form-edit-user-password");

  document.querySelectorAll(".btn-edit-user").forEach((btn) => {
    btn.addEventListener("click", () => {
      label.textContent = btn.dataset.username;
      form.action = `/admin/users/${btn.dataset.id}/password`;
      passwordField.value = "";
      modal.classList.remove("hidden");
    });
  });

  document.querySelectorAll(".btn-cancel").forEach((btn) => {
    btn.addEventListener("click", () => modal.classList.add("hidden"));
  });

  // Confirmación propia (en vez del confirm() nativo del navegador) para eliminar un usuario.
  document.querySelectorAll(".form-confirm").forEach((f) => {
    f.addEventListener("submit", (e) => {
      if (f.dataset.confirmed) return;
      e.preventDefault();
      showConfirm(f.dataset.confirmMessage, () => {
        f.dataset.confirmed = "1";
        f.submit();
      });
    });
  });
});
