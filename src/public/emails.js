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
  const list = document.getElementById("secondary-emails-list");
  const modalAdd = document.getElementById("modal-add-secondary-email");
  const modalEdit = document.getElementById("modal-edit-secondary-email");
  const btnAdd = document.getElementById("btn-add-secondary-email");
  const addField = document.getElementById("add-secondary-email-field");
  const formAdd = document.getElementById("form-add-secondary-email");
  const editField = document.getElementById("edit-secondary-email-field");
  const formEdit = document.getElementById("form-edit-secondary-email");

  document.querySelectorAll(".btn-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = btn.closest(".modal");
      if (modal) modal.classList.add("hidden");
    });
  });

  function removeEmptyState() {
    const empty = list.querySelector(".list-empty");
    if (empty) empty.remove();
  }

  function cardHtml(id, email) {
    return (
      '<div class="secondary-email-card" data-id="' + id + '" data-email="' + email.replace(/"/g, "&quot;") + '">' +
      '<span class="secondary-email-text"></span>' +
      '<div class="icon-actions-group">' +
      '<button type="button" class="icon-action btn-edit-secondary-email" title="Editar" data-id="' + id + '" data-email="' + email.replace(/"/g, "&quot;") + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>' +
      "</button>" +
      '<button type="button" class="icon-action danger-hover btn-delete-secondary-email" title="Eliminar" data-id="' + id + '" data-email="' + email.replace(/"/g, "&quot;") + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>' +
      "</button>" +
      "</div>" +
      "</div>"
    );
  }

  function wireCard(card) {
    const editBtn = card.querySelector(".btn-edit-secondary-email");
    const deleteBtn = card.querySelector(".btn-delete-secondary-email");
    editBtn.addEventListener("click", () => {
      formEdit.dataset.id = editBtn.dataset.id;
      editField.value = editBtn.dataset.email;
      modalEdit.classList.remove("hidden");
      editField.focus();
    });
    deleteBtn.addEventListener("click", () => {
      showConfirm(`¿Eliminar ${deleteBtn.dataset.email}?`, () => {
        apiFetch(`/emails/${deleteBtn.dataset.id}/delete`, { method: "POST" })
          .then((r) => r.json())
          .then(() => {
            card.remove();
            if (!list.querySelector(".secondary-email-card")) {
              list.innerHTML = '<div class="list-empty">Todavía no has agregado ningún correo aquí.</div>';
            }
            showToast("Correo eliminado");
          })
          .catch((err) => {
            if (err.message !== "unauthenticated") showToast("No se pudo eliminar el correo.");
          });
      });
    });
  }

  list.querySelectorAll(".secondary-email-card").forEach(wireCard);

  if (btnAdd) {
    btnAdd.addEventListener("click", () => {
      addField.value = "";
      modalAdd.classList.remove("hidden");
      addField.focus();
    });
  }

  if (formAdd) {
    formAdd.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = addField.value.trim();
      if (!email) return;
      apiFetch("/emails", {
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
          removeEmptyState();
          const wrapper = document.createElement("div");
          wrapper.innerHTML = cardHtml(data.id, data.email);
          const card = wrapper.firstElementChild;
          card.querySelector(".secondary-email-text").textContent = data.email;
          list.prepend(card);
          wireCard(card);
          modalAdd.classList.add("hidden");
          showToast("Correo agregado");
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo agregar el correo.");
        });
    });
  }

  if (formEdit) {
    formEdit.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = formEdit.dataset.id;
      const email = editField.value.trim();
      if (!email) return;
      apiFetch(`/emails/${id}`, {
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
          const card = list.querySelector(`.secondary-email-card[data-id="${id}"]`);
          if (card) {
            card.dataset.email = data.email;
            card.querySelector(".secondary-email-text").textContent = data.email;
            const editBtn = card.querySelector(".btn-edit-secondary-email");
            const deleteBtn = card.querySelector(".btn-delete-secondary-email");
            editBtn.dataset.email = data.email;
            deleteBtn.dataset.email = data.email;
          }
          modalEdit.classList.add("hidden");
          showToast("Correo actualizado");
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo guardar el correo.");
        });
    });
  }
});
