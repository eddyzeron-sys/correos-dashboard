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
  const compraMontoHint = document.getElementById("compra-monto-hint");
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
  // Al crear: la tienda es multi-selección — cada tienda elegida tiene su
  // propio grupo de "cantidad gastada" (con su propio "+" para sumar varias
  // cantidades DENTRO de esa tienda), y al guardar se crea una compra por
  // cada tienda. Al editar una compra ya existente, es solo una tienda fija.
  const compraMontoGroups = document.getElementById("compra-monto-groups");
  const modalTitle = document.getElementById("modal-add-compra-title");
  const btnSubmitCompra = document.getElementById("btn-submit-compra");
  let editingRegistroId = null;

  function montoRowHtml(mode) {
    let btnHtml = "";
    if (mode === "add") {
      btnHtml =
        '<button type="button" class="icon-action btn-add-monto-in-group" title="Sumar otra cantidad a esta tienda">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
        '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>';
    } else if (mode === "remove") {
      btnHtml =
        '<button type="button" class="icon-action danger-hover btn-remove-monto-in-group" title="Quitar esta cantidad">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>';
    }
    return (
      '<div class="row compra-monto-row">' +
      '<span class="muted" style="font-weight:700;">$</span>' +
      '<input type="number" class="compra-monto-input" step="0.01" min="0" placeholder="0.00" />' +
      btnHtml +
      "</div>"
    );
  }

  function sumGroupMontos(group) {
    const values = Array.from(group.querySelectorAll(".compra-monto-input"))
      .map((i) => parseFloat(i.value))
      .filter((v) => !Number.isNaN(v));
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  }

  function updateGroupTotal(group) {
    let totalLine = group.querySelector(".compra-monto-total-line");
    const rows = group.querySelectorAll(".compra-monto-row").length;
    const total = sumGroupMontos(group);
    if (rows > 1 && total !== null) {
      if (!totalLine) {
        totalLine = document.createElement("div");
        totalLine.className = "compra-monto-total-line";
        group.appendChild(totalLine);
      }
      totalLine.textContent = "Total " + group.dataset.tagName + ": $" + total.toFixed(2);
    } else if (totalLine) {
      totalLine.remove();
    }
  }

  function updateMontoPlaceholder() {
    const hasGroups = compraMontoGroups.children.length > 0;
    if (compraMontoHint) compraMontoHint.style.display = hasGroups ? "none" : "";
  }

  // singleMode true = modo editar (una sola tienda, sin +/-, prellenado).
  function addMontoGroup(tagId, tagName, singleMode, existingMonto) {
    const div = document.createElement("div");
    div.className = "compra-monto-group";
    div.dataset.tagId = tagId;
    div.dataset.tagName = tagName;
    div.innerHTML =
      '<div class="compra-monto-group-header"><span>' +
      escapeHtml(tagName) +
      '</span></div><div class="compra-monto-rows">' +
      montoRowHtml(singleMode ? "none" : "add") +
      "</div>";
    compraMontoGroups.appendChild(div);
    if (existingMonto !== undefined && existingMonto !== null && existingMonto !== "") {
      div.querySelector(".compra-monto-input").value = existingMonto;
    }
    updateMontoPlaceholder();
    return div;
  }

  function removeMontoGroup(tagId) {
    const group = compraMontoGroups.querySelector('.compra-monto-group[data-tag-id="' + tagId + '"]');
    if (group) group.remove();
    updateMontoPlaceholder();
  }

  compraMontoGroups.addEventListener("click", (e) => {
    const addBtn = e.target.closest(".btn-add-monto-in-group");
    if (addBtn) {
      addBtn.closest(".compra-monto-rows").insertAdjacentHTML("beforeend", montoRowHtml("remove"));
      updateGroupTotal(addBtn.closest(".compra-monto-group"));
      return;
    }
    const removeBtn = e.target.closest(".btn-remove-monto-in-group");
    if (removeBtn) {
      const group = removeBtn.closest(".compra-monto-group");
      removeBtn.closest(".compra-monto-row").remove();
      updateGroupTotal(group);
    }
  });
  compraMontoGroups.addEventListener("input", (e) => {
    if (e.target.classList.contains("compra-monto-input")) {
      updateGroupTotal(e.target.closest(".compra-monto-group"));
    }
  });

  // existing === null → modo agregar. existing === {id, tag_id, tarjeta, monto, correo} → modo editar.
  function openCompraModal(existing) {
    editingRegistroId = existing ? existing.id : null;
    modalTitle.textContent = existing ? "Editar compra" : "Agregar compra";
    btnSubmitCompra.textContent = existing ? "Guardar cambios" : "Guardar compra";
    compraCorreoField.value = existing ? existing.correo : "";
    compraTarjetaField.value = existing ? existing.tarjeta : "";
    newCompraTagName.value = "";
    compraMontoGroups.innerHTML = "";
    compraTagsChecklist.querySelectorAll(".tag-card").forEach((c) => c.classList.remove("selected"));

    if (existing) {
      const card = compraTagsChecklist.querySelector('.tag-card[data-tag-id="' + existing.tag_id + '"]');
      if (card) {
        card.classList.add("selected");
        addMontoGroup(existing.tag_id, card.querySelector(".tag-card-name").textContent.trim(), true, existing.monto);
      }
    }
    updateMontoPlaceholder();
    modalAddCompra.classList.remove("hidden");
  }

  compraTagsChecklist.addEventListener("click", (e) => {
    const card = e.target.closest(".tag-card");
    if (!card) return;
    const tagId = card.dataset.tagId;
    const tagName = card.querySelector(".tag-card-name").textContent.trim();

    if (editingRegistroId) {
      // Editar: una sola tienda a la vez, cambiarla reemplaza la anterior.
      compraTagsChecklist.querySelectorAll(".tag-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      compraMontoGroups.innerHTML = "";
      addMontoGroup(tagId, tagName, true, null);
      return;
    }

    // Crear: clic alterna — se pueden elegir varias tiendas a la vez, cada
    // una con su propio grupo de cantidades, sin perder lo ya escrito en
    // las demás.
    const nowSelected = !card.classList.contains("selected");
    card.classList.toggle("selected", nowSelected);
    if (nowSelected) {
      addMontoGroup(tagId, tagName, false);
    } else {
      removeMontoGroup(tagId);
    }
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
          compraTagsChecklist.insertAdjacentHTML(
            "beforeend",
            '<div class="tag-card" data-tag-id="' + data.id + '"><span class="tag-card-name">' +
              escapeHtml(data.name) +
              "</span></div>"
          );
          const newCard = compraTagsChecklist.lastElementChild;
          if (editingRegistroId) {
            compraTagsChecklist.querySelectorAll(".tag-card").forEach((c) => c.classList.remove("selected"));
            newCard.classList.add("selected");
            compraMontoGroups.innerHTML = "";
            addMontoGroup(data.id, data.name, true, null);
          } else {
            newCard.classList.add("selected");
            addMontoGroup(data.id, data.name, false);
          }
          newCompraTagName.value = "";
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
      const correo = compraCorreoField.value.trim();
      if (!correo) {
        compraCorreoField.focus();
        return;
      }
      const tarjeta = compraTarjetaField.value.trim();
      const groups = Array.from(compraMontoGroups.querySelectorAll(".compra-monto-group"));
      if (!groups.length) {
        showToast("Elige primero la tienda.");
        return;
      }

      if (editingRegistroId) {
        const group = groups[0];
        const monto = group.querySelector(".compra-monto-input").value;
        const body = new URLSearchParams({
          compra_email_id: selectedEmailId,
          correo,
          tarjeta,
          tag_id: group.dataset.tagId,
          monto,
        });
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

      // Crear: una compra por cada tienda seleccionada, sumando las
      // cantidades que se hayan puesto dentro de esa tienda.
      const requests = groups.map((group) =>
        postRegistro(selectedEmailId, correo, tarjeta, group.dataset.tagId, sumGroupMontos(group))
      );
      Promise.all(requests)
        .then((results) => {
          const errored = results.find((r) => r.error);
          if (errored) {
            showToast(errored.error);
            return;
          }
          modalAddCompra.classList.add("hidden");
          results.forEach((r) => insertRegistroCard(r.registro));
          wireRegistroDeleteButtons();
          wireRegistroCardClicks();
          showToast(results.length > 1 ? `${results.length} compras agregadas` : "Compra agregada");
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo guardar la compra.");
        });
    });
  }
});
