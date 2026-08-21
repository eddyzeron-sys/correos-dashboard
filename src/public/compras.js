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
      document.getElementById("modal-add-compra").classList.add("hidden");
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
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
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
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      showConfirm(`¿Eliminar ${btn.dataset.email}?`, () => {
        apiFetch(`/compras/emails/${btn.dataset.id}/delete`, { method: "POST" })
          .then((r) => r.json())
          .then(() => {
            const card = btn.closest(".compra-email-card");
            if (card) {
              if (card.classList.contains("active")) showComprasPanelEmpty();
              card.remove();
            }
            showToast("Correo eliminado");
          })
          .catch((err) => {
            if (err.message !== "unauthenticated") showToast("No se pudo eliminar el correo.");
          });
      });
    });
  });

  // ---------- Selección de correo + registro de compras ----------
  const comprasPanel = document.getElementById("compras-panel");
  const modalAddCompra = document.getElementById("modal-add-compra");
  const formAddCompra = document.getElementById("form-add-compra");
  const compraCorreoField = document.getElementById("compra-correo-field");
  const compraTarjetaField = document.getElementById("compra-tarjeta-field");
  const compraMontosList = document.getElementById("compra-montos-list");
  const compraMontoHint = document.getElementById("compra-monto-hint");
  const compraMontoMultiHint = document.getElementById("compra-monto-multi-hint");
  const compraTagsChecklist = document.getElementById("compra-tags-checklist");
  const newCompraTagName = document.getElementById("new-compra-tag-name");
  const btnAddCompraTag = document.getElementById("btn-add-compra-tag");

  let selectedEmailId = null;
  let selectedEmailText = null;

  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function money(n) {
    return n === null || n === undefined ? "0.00" : Number(n).toFixed(2);
  }

  function registroCardHtml(r) {
    return (
      '<div class="compra-registro-card" data-id="' + r.id + '" data-tag-id="' + (r.tag_id || "") + '"' +
      ' data-tarjeta="' + escapeHtml(r.tarjeta || "") + '" data-monto="' + (r.monto || "") + '"' +
      ' data-correo="' + escapeHtml(r.correo || "") + '">' +
      '<button type="button" class="btn-remove-registro" data-id="' + r.id + '" title="Eliminar">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>' +
      '<div><span class="field-label">Tarjeta</span><span class="field-value">' +
      (r.tarjeta ? escapeHtml(r.tarjeta) : "—") +
      "</span></div>" +
      '<div><span class="field-label">Tienda</span><span class="field-value">' +
      (r.tag_name ? escapeHtml(r.tag_name) : "—") +
      "</span></div>" +
      '<div><span class="field-label">Gastado</span><span class="field-value monto-value">$' +
      money(r.monto) +
      "</span></div>" +
      '<div><span class="field-label">Correo</span><span class="field-value">' +
      escapeHtml(r.correo || "") +
      "</span></div>" +
      "</div>"
    );
  }

  function wireRegistroDeleteButtons() {
    comprasPanel.querySelectorAll(".btn-remove-registro").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        showConfirm("¿Eliminar esta compra registrada?", () => {
          apiFetch(`/compras/registros/${btn.dataset.id}/delete`, { method: "POST" })
            .then((r) => r.json())
            .then(() => {
              const card = btn.closest(".compra-registro-card");
              if (card) card.remove();
              showToast("Compra eliminada");
            })
            .catch((err) => {
              if (err.message !== "unauthenticated") showToast("No se pudo eliminar.");
            });
        });
      });
    });
  }

  function wireRegistroCardClicks() {
    comprasPanel.querySelectorAll(".compra-registro-card").forEach((card) => {
      card.addEventListener("click", () => {
        openCompraModal({
          id: card.dataset.id,
          tag_id: card.dataset.tagId,
          tarjeta: card.dataset.tarjeta,
          monto: card.dataset.monto,
          correo: card.dataset.correo,
        });
      });
    });
  }

  function showComprasPanelEmpty() {
    selectedEmailId = null;
    selectedEmailText = null;
    comprasPanel.innerHTML = '<div class="list-empty">Selecciona un correo a la izquierda para ver su registro de compras.</div>';
  }

  function renderRegistros(registros) {
    const listHtml = registros.length
      ? '<div class="compra-registros-list">' + registros.map(registroCardHtml).join("") + "</div>"
      : '<div class="list-empty">Todavía no hay compras registradas para este correo.</div>';

    comprasPanel.innerHTML =
      '<div class="compras-panel-header"><h2>' +
      escapeHtml(selectedEmailText) +
      '</h2><button type="button" id="btn-add-compra" class="btn-cta btn-icon-only" title="Agregar compra">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button></div>' +
      listHtml;

    document.getElementById("btn-add-compra").addEventListener("click", () => openCompraModal(null));
    wireRegistroDeleteButtons();
    wireRegistroCardClicks();
  }

  function loadRegistrosFor(id, email) {
    selectedEmailId = id;
    selectedEmailText = email;
    comprasPanel.innerHTML = '<div class="list-empty">Cargando…</div>';
    apiFetch(`/compras/emails/${id}/registros`)
      .then((r) => r.json())
      .then((data) => renderRegistros(data.registros || []))
      .catch((err) => {
        if (err.message !== "unauthenticated") showToast("No se pudo cargar el registro.");
      });
  }

  document.querySelectorAll(".compra-email-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".compra-email-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      loadRegistrosFor(card.dataset.id, card.dataset.email);
    });
  });

  // ---------- Modal "Agregar/editar compra" ----------
  const modalTitle = document.getElementById("modal-add-compra-title");
  const btnSubmitCompra = document.getElementById("btn-submit-compra");
  let editingRegistroId = null;

  // El monto no se puede tocar hasta elegir la tienda primero.
  function updateMontoLock() {
    const hasTag = !!compraTagsChecklist.querySelector(".tag-card.selected");
    compraMontosList.querySelectorAll(".compra-monto-input").forEach((input) => {
      input.disabled = !hasTag;
      if (!hasTag) input.value = "";
    });
    if (compraMontoHint) compraMontoHint.style.display = hasTag ? "none" : "";
    updateMontoTotal();
  }

  function montoRowHtml() {
    return (
      '<div class="row compra-monto-row">' +
      '<span class="muted" style="font-weight:700;">$</span>' +
      '<input type="number" class="compra-monto-input" step="0.01" min="0" placeholder="0.00" />' +
      '<button type="button" class="icon-action danger-hover btn-remove-monto" title="Quitar esta cantidad">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>' +
      "</div>"
    );
  }

  function resetMontosList() {
    compraMontosList.innerHTML =
      '<div class="row compra-monto-row">' +
      '<span class="muted" style="font-weight:700;">$</span>' +
      '<input type="number" class="compra-monto-input" step="0.01" min="0" placeholder="0.00" disabled />' +
      '<button type="button" class="icon-action btn-add-monto" title="Sumar otra cantidad al total">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>' +
      "</div>";
    updateMontoTotal();
  }

  function sumMontos() {
    const values = Array.from(compraMontosList.querySelectorAll(".compra-monto-input"))
      .map((i) => parseFloat(i.value))
      .filter((v) => !Number.isNaN(v));
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  }

  const compraMontoTotal = document.getElementById("compra-monto-total");
  function updateMontoTotal() {
    if (!compraMontoTotal) return;
    const rows = compraMontosList.querySelectorAll(".compra-monto-row").length;
    const total = sumMontos();
    if (rows > 1 && total !== null) {
      compraMontoTotal.textContent = "Total: $" + total.toFixed(2);
      compraMontoTotal.style.display = "";
    } else {
      compraMontoTotal.style.display = "none";
    }
  }

  // Clic en "+" agrega otra fila de cantidad — todas suman al monto de esta
  // misma compra (una sola tarjeta), no crean compras separadas. La "x" de
  // una fila la quita de la suma.
  compraMontosList.addEventListener("click", (e) => {
    if (e.target.closest(".btn-add-monto")) {
      compraMontosList.insertAdjacentHTML("beforeend", montoRowHtml());
      if (compraMontoMultiHint) compraMontoMultiHint.style.display = "";
      updateMontoTotal();
      return;
    }
    const removeBtn = e.target.closest(".btn-remove-monto");
    if (removeBtn) {
      removeBtn.closest(".compra-monto-row").remove();
      updateMontoTotal();
    }
  });
  compraMontosList.addEventListener("input", (e) => {
    if (e.target.classList.contains("compra-monto-input")) updateMontoTotal();
  });

  // existing === null → modo agregar. existing === {id, tag_id, tarjeta, monto, correo} → modo editar.
  function openCompraModal(existing) {
    editingRegistroId = existing ? existing.id : null;
    modalTitle.textContent = existing ? "Editar compra" : "Agregar compra";
    btnSubmitCompra.textContent = existing ? "Guardar cambios" : "Guardar compra";
    compraCorreoField.value = existing ? existing.correo : "";
    compraTarjetaField.value = existing ? existing.tarjeta : "";
    newCompraTagName.value = "";
    compraTagsChecklist.querySelectorAll(".tag-card").forEach((c) => {
      c.classList.toggle("selected", existing && String(c.dataset.tagId) === String(existing.tag_id));
    });
    resetMontosList();
    // Al editar una compra ya existente no tiene sentido partirla en varias —
    // el "+" de agregar otra cantidad solo aplica al crear.
    const addBtn = compraMontosList.querySelector(".btn-add-monto");
    if (addBtn) addBtn.style.display = existing ? "none" : "";
    if (compraMontoMultiHint) compraMontoMultiHint.style.display = "none";
    updateMontoLock();
    compraMontosList.querySelector(".compra-monto-input").value = existing ? existing.monto : "";
    modalAddCompra.classList.remove("hidden");
  }

  compraTagsChecklist.addEventListener("click", (e) => {
    const card = e.target.closest(".tag-card");
    if (!card) return;
    const alreadySelected = card.classList.contains("selected");
    compraTagsChecklist.querySelectorAll(".tag-card").forEach((c) => c.classList.remove("selected"));
    if (!alreadySelected) card.classList.add("selected");
    updateMontoLock();
  });

  if (btnAddCompraTag) {
    btnAddCompraTag.addEventListener("click", () => {
      const name = newCompraTagName.value.trim();
      if (!name) {
        newCompraTagName.focus();
        return;
      }
      apiFetch("/compras/tags", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `name=${encodeURIComponent(name)}`,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            showToast(data.error);
            return;
          }
          const emptyMsg = document.getElementById("compra-tags-empty-msg");
          if (emptyMsg) emptyMsg.remove();
          compraTagsChecklist.querySelectorAll(".tag-card").forEach((c) => c.classList.remove("selected"));
          compraTagsChecklist.insertAdjacentHTML(
            "beforeend",
            '<div class="tag-card selected" data-tag-id="' + data.id + '"><span class="tag-card-name">' +
              escapeHtml(data.name) +
              "</span></div>"
          );
          newCompraTagName.value = "";
          updateMontoLock();
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo crear la etiqueta.");
        });
    });
  }

  function insertRegistroCard(registro) {
    const emptyState = comprasPanel.querySelector(".list-empty");
    if (emptyState) {
      comprasPanel
        .querySelector(".compras-panel-header")
        .insertAdjacentHTML("afterend", '<div class="compra-registros-list"></div>');
      emptyState.remove();
    }
    comprasPanel.querySelector(".compra-registros-list").insertAdjacentHTML("afterbegin", registroCardHtml(registro));
  }

  function postRegistro(compraEmailId, correo, tarjeta, tagId, monto) {
    const body = new URLSearchParams({
      compra_email_id: compraEmailId,
      correo,
      tarjeta,
      tag_id: tagId,
      monto: monto === null ? "" : String(monto),
    });
    return apiFetch("/compras/registros", { method: "POST", body }).then((r) => r.json());
  }

  if (formAddCompra) {
    formAddCompra.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!selectedEmailId) return;
      const selectedTag = compraTagsChecklist.querySelector(".tag-card.selected");
      if (!selectedTag) {
        showToast("Elige primero la tienda.");
        return;
      }
      const correo = compraCorreoField.value.trim();
      if (!correo) {
        compraCorreoField.focus();
        return;
      }
      const tarjeta = compraTarjetaField.value.trim();
      const tagId = selectedTag.dataset.tagId;

      if (editingRegistroId) {
        const monto = compraMontosList.querySelector(".compra-monto-input").value;
        const body = new URLSearchParams({ compra_email_id: selectedEmailId, correo, tarjeta, tag_id: tagId, monto });
        apiFetch(`/compras/registros/${editingRegistroId}`, { method: "POST", body })
          .then((r) => r.json())
          .then((data) => {
            if (data.error) {
              showToast(data.error);
              return;
            }
            modalAddCompra.classList.add("hidden");
            const existingCard = comprasPanel.querySelector(
              '.compra-registro-card[data-id="' + editingRegistroId + '"]'
            );
            if (existingCard) existingCard.outerHTML = registroCardHtml(data.registro);
            wireRegistroDeleteButtons();
            wireRegistroCardClicks();
            showToast("Compra actualizada");
          })
          .catch((err) => {
            if (err.message !== "unauthenticated") showToast("No se pudo guardar la compra.");
          });
        return;
      }

      // Modo crear: una sola compra — si se agregaron varias cantidades con
      // el "+", se suman en un solo monto (misma tienda/correo/tarjeta).
      const monto = sumMontos();
      postRegistro(selectedEmailId, correo, tarjeta, tagId, monto)
        .then((data) => {
          if (data.error) {
            showToast(data.error);
            return;
          }
          modalAddCompra.classList.add("hidden");
          insertRegistroCard(data.registro);
          wireRegistroDeleteButtons();
          wireRegistroCardClicks();
          showToast("Compra agregada");
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo guardar la compra.");
        });
    });
  }
});
