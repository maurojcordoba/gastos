import { supabaseClient } from './supabase.js';

async function verificarConexionSupabase() {
  const { data, error } = await supabaseClient.from('personas').select('id_persona').limit(1);
  if (error) {
    console.error('❌ Error de conexión a Supabase:', error.message);
    alert('Error de conexión a Supabase: ' + error.message);
  } else {
    console.log('✅ Conexión a Supabase exitosa.');
  }
}

async function cargarPersonasEnSelect() {
  const { data: personas, error } = await supabaseClient
    .from('personas')
    .select('id_persona, nombre')
    .eq('activo', true);

  const select = document.getElementById('personaPagadora');
  select.innerHTML = ''; // Limpiar antes

  if (error) {
    console.error('Error cargando personas en select:', error.message);
    return;
  }

  if (!personas || personas.length === 0) {
    const option = document.createElement('option');
    option.textContent = 'No hay personas disponibles';
    option.disabled = true;
    select.appendChild(option);
    return;
  }
  personas.sort((a, b) => a.nombre.localeCompare(b.nombre));

  personas.forEach((p) => {
    const option = document.createElement('option');
    option.value = p.id_persona;
    option.textContent = capitalize(p.nombre);
    select.appendChild(option);
  });
}

async function cargarPersonas() {
  const { data: personas, error } = await supabaseClient
    .from('personas')
    .select('id_persona, nombre')
    .eq('activo', true);

  const contenedor = document.getElementById('personas');
  contenedor.innerHTML = '';

  if (error) {
    console.error('Error cargando personas:', error.message);
    contenedor.innerHTML = '<p class="text-center">Error cargando personas.</p>';
    return;
  }

  if (!personas || personas.length === 0) {
    contenedor.innerHTML = '<p class="text-center">No hay personas cargadas.</p>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'table table-sm table-hover w-auto'; // tabla más chica y angosta

  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Persona</th><th></th></tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  personas.forEach((p) => {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${capitalize(p.nombre)}</td>
        <td class="text-end"></td> <!-- alineamos a la derecha -->
      `;

    const btnEliminar = document.createElement('button');
    btnEliminar.className = 'btn btn-sm btn-outline-danger';
    btnEliminar.innerHTML = '<i class="bi bi-trash"></i>'; // ícono "×" de Bootstrap simple
    btnEliminar.title = 'Eliminar Persona';
    btnEliminar.addEventListener('click', () => eliminarPersona(p.id_persona));

    row.querySelector('td:last-child').appendChild(btnEliminar);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  contenedor.appendChild(table);
}

async function eliminarPersona(idPersona) {
  if (!confirm('¿Seguro que quieres eliminar esta persona?')) return;

  // Verificar si tiene gastos asociados
  const { data: gastos, error: errorGastos } = await supabaseClient
    .from('gastos')
    .select('id_gasto')
    .eq('persona_pagadora', idPersona);

  if (errorGastos) {
    console.error('Error consultando gastos de la persona:', errorGastos.message);
    alert('Error verificando los gastos de la persona.');
    return;
  }

  if (gastos && gastos.length > 0) {
    alert('No puedes eliminar esta persona porque tiene gastos registrados.');
    return;
  }

  // Si no tiene gastos, eliminar (marcar como inactiva)
  const { error } = await supabaseClient
    .from('personas')
    .update({ activo: false })
    .eq('id_persona', idPersona);

  if (error) {
    console.error('Error eliminando persona:', error.message);
    alert('Error eliminando persona.');
  } else {
    alert('Persona eliminada exitosamente.');
    cargarPersonas();
    cargarPersonasEnSelect();
    cargarGastosYResumen();
    calcularTransferencias();
  }
}

function mostrarFormularioGasto() {
  document.getElementById('formulario-gasto').style.display = 'block';
  document.getElementById('formulario-persona').style.display = 'none';
}

function mostrarFormularioPersona() {
  document.getElementById('formulario-gasto').style.display = 'none';
  document.getElementById('formulario-persona').style.display = 'block';
}

async function agregarPersona() {
  const nombrePersona = document.getElementById('nombrePersona').value;
  if (!nombrePersona) {
    alert('Debe ingresar un nombre');
    return;
  }

  const { error } = await supabaseClient.from('personas').insert([{ nombre: nombrePersona }]);

  if (error) {
    console.error(error);
  } else {
    alert('Persona agregada exitosamente');
    location.reload();
  }
}

async function agregarGasto() {
  const descripcion = document.getElementById('descripcion').value;
  const monto = parseFloat(document.getElementById('monto').value);
  const foto = document.getElementById('foto').files[0];
  const personaPagadora = document.getElementById('personaPagadora').value;

  if (!descripcion || isNaN(monto) || !personaPagadora) {
    alert('Debe completar todos los campos.');
    return;
  }

  let fotoUrl = null;

  // 🔥 Primero subimos la foto (si existe)
  if (foto) {
    const filePath = `${Date.now()}_${foto.name}`;

    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('tickets')
      .upload(filePath, foto);

    if (uploadError) {
      console.error('Error subiendo imagen:', uploadError.message);
      alert('Error subiendo la imagen. Puedes intentar sin foto.');
      return;
    }

    // 👇 Aquí corregimos cómo obtener el URL público
    const { data: publicUrlData } = supabaseClient.storage.from('tickets').getPublicUrl(filePath);

    fotoUrl = publicUrlData.publicUrl;
  }

  // 🔥 Ahora insertamos el gasto con foto_ticket (si hay)
  const { error } = await supabaseClient.from('gastos').insert([
    {
      descripcion: capitalize(descripcion),
      monto,
      persona_pagadora: personaPagadora,
      fecha: new Date().toISOString(),
      foto_ticket: fotoUrl, // acá enviamos el link, incluso si es null
    },
  ]);

  if (error) {
    console.error('Error guardando gasto:', error.message);
    alert('Error guardando el gasto.');
  } else {
    alert('Gasto registrado exitosamente.');
    cargarGastosYResumen();
    calcularTransferencias();
    cargarPersonasEnSelect(); // refrescar personas por si cambió
    document.getElementById('formulario-gasto').style.display = 'none'; // ocultar formulario
    limpiarFormularioGasto(); // opcional limpiar campos
  }
}

function limpiarFormularioGasto() {
  document.getElementById('descripcion').value = '';
  document.getElementById('monto').value = '';
  document.getElementById('foto').value = '';
  document.getElementById('personaPagadora').selectedIndex = 0;
}

async function calcularTransferencias() {
  const { data: personas, error: errorPersonas } = await supabaseClient
    .from('personas')
    .select('id_persona, nombre')
    .eq('activo', true);
  const { data: gastos, error: errorGastos } = await supabaseClient
    .from('gastos')
    .select('persona_pagadora, monto');

  if (errorPersonas || errorGastos) {
    console.error('Error cargando datos para calcular transferencias');
    return;
  }

  const totalGastos = gastos.reduce((sum, gasto) => sum + gasto.monto, 0);
  const gastoPorPersona = totalGastos / personas.length;

  const saldos = {};
  personas.forEach((p) => (saldos[p.id_persona] = -gastoPorPersona));
  gastos.forEach((g) => (saldos[g.persona_pagadora] += g.monto));

  let deudores = Object.entries(saldos)
    .filter(([_, saldo]) => saldo < 0)
    .sort((a, b) => a[1] - b[1]);
  let acreedores = Object.entries(saldos)
    .filter(([_, saldo]) => saldo > 0)
    .sort((a, b) => b[1] - a[1]);

  const lista = document.getElementById('lista-transferencias');
  lista.innerHTML = '';

  while (deudores.length && acreedores.length) {
    const [idDeudor, saldoDeudor] = deudores[0];
    const [idAcreedor, saldoAcreedor] = acreedores[0];

    const montoTransferencia = Math.min(-saldoDeudor, saldoAcreedor);

    const nombreDeudor = personas.find((p) => p.id_persona === idDeudor).nombre;
    const nombreAcreedor = personas.find((p) => p.id_persona === idAcreedor).nombre;

    const item = document.createElement('li');
    item.className = 'list-group-item';
    item.innerHTML = `<strong>${capitalize(
      nombreDeudor
    )}</strong> debe transferir <strong>${formatCurrency(montoTransferencia)}
    </strong> a <strong>${capitalize(nombreAcreedor)}</strong>`;
    lista.appendChild(item);

    saldos[idDeudor] += montoTransferencia;
    saldos[idAcreedor] -= montoTransferencia;

    deudores = Object.entries(saldos)
      .filter(([_, saldo]) => saldo < -0.01)
      .sort((a, b) => a[1] - b[1]);
    acreedores = Object.entries(saldos)
      .filter(([_, saldo]) => saldo > 0.01)
      .sort((a, b) => b[1] - a[1]);
  }
}

function capitalize(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function formatCurrency(amount) {
  return amount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

async function cargarGastosYResumen() {
  const { data: gastos, error } = await supabaseClient
    .from('gastos')
    .select('id_gasto, descripcion, monto, persona_pagadora (nombre),foto_ticket')
    .order('persona_pagadora (nombre)', { ascending: true })
    .order('descripcion', { ascending: true });

  if (error) {
    console.error('Error cargando gastos:', error.message);
    return;
  }

  const resumen = document.getElementById('resumen-gastos');
  resumen.innerHTML = '';

  if (!gastos || gastos.length === 0) {
    resumen.innerHTML = '<p class="text-center">No hay gastos cargados.</p>';
    return;
  }

  let total = 0;

  const table = document.createElement('table');
  table.className = 'table table-striped';

  const thead = document.createElement('thead');
  thead.innerHTML =
    '<tr><th>Pagado por</th><th>Descripción</th><th>Monto</th><th>Acciones</th></tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  gastos.forEach((g) => {
    total += g.monto;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${capitalize(g.persona_pagadora?.nombre || 'Desconocido')}</td>
      <td>${capitalize(g.descripcion)}</td>
      <td>${formatCurrency(g.monto)}</td>
      <td class="d-flex gap-2"></td>
    `;

    const accionesTd = row.querySelector('td:last-child');

    // Botón Eliminar
    const btnEliminar = document.createElement('button');
    btnEliminar.className = 'btn btn-sm btn-outline-danger';
    btnEliminar.innerHTML = '<i class="bi bi-trash"></i>'; // Icono de basurero
    btnEliminar.title = 'Eliminar Gasto';
    btnEliminar.addEventListener('click', () => eliminarGasto(g.id_gasto));
    accionesTd.appendChild(btnEliminar);

    // Botón Ver Ticket si tiene foto
    if (g.foto_ticket) {
      const btnVerTicket = document.createElement('button');
      btnVerTicket.className = 'btn btn-sm btn-primary';
      btnVerTicket.innerHTML = '<i class="bi bi-eye"></i>'; // Icono de ojo (ver)
      btnVerTicket.title = 'Ver Ticket';
      btnVerTicket.addEventListener('click', () => verTicket(g.foto_ticket));
      accionesTd.appendChild(btnVerTicket);
      console.log('paso');
    }

    tbody.appendChild(row);
  });

  const totalRow = document.createElement('tr');
  totalRow.innerHTML = `
      <td colspan="2"><strong>Total</strong></td>
      <td><strong>${formatCurrency(total)}</strong></td>
      <td></td>
    `;
  tbody.appendChild(totalRow);

  table.appendChild(tbody);
  resumen.appendChild(table);

  const { data: personas, error: errorPersonas } = await supabaseClient
    .from('personas')
    .select('*')
    .eq('activo', true);
  if (!errorPersonas && personas.length > 0) {
    const totalPorPersona = document.createElement('div');
    totalPorPersona.className = 'text-center mt-2';
    totalPorPersona.innerHTML = `<strong>Cantidad de Personas:</strong> ${personas.length}`;
    resumen.appendChild(totalPorPersona);
  }
}

function verTicket(url) {
  window.open(url, '_blank');
}

async function eliminarGasto(idGasto) {
  if (!confirm('¿Seguro que quieres eliminar este gasto?')) return;

  const { error } = await supabaseClient.from('gastos').delete().eq('id_gasto', idGasto);

  if (error) {
    console.error('Error eliminando gasto:', error.message);
    alert('Error eliminando gasto.');
  } else {
    alert('Gasto eliminado exitosamente.');
    cargarGastosYResumen();
    calcularTransferencias();
  }
}

function toggleListadoPersonas() {
  const contenedor = document.getElementById('personas');
  const boton = document.getElementById('btnTogglePersonas');

  if (contenedor.style.display === 'none' || contenedor.style.display === '') {
    contenedor.style.display = 'block';
    boton.textContent = 'Ocultar Personas';
  } else {
    contenedor.style.display = 'none';
    boton.textContent = 'Mostrar Personas';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnAgregarGasto').addEventListener('click', mostrarFormularioGasto);
  document.getElementById('btnAgregarPersona').addEventListener('click', mostrarFormularioPersona);
  document.getElementById('btnGuardarGasto').addEventListener('click', agregarGasto);
  document.getElementById('btnGuardarPersona').addEventListener('click', agregarPersona);
  document.getElementById('btnTogglePersonas').addEventListener('click', toggleListadoPersonas);

  // 🔥 OCULTAR listado de personas por defecto
  document.getElementById('personas').style.display = 'none';
  document.getElementById('btnTogglePersonas').textContent = 'Mostrar Personas';

  //verificarConexionSupabase();
  cargarPersonas();
  cargarPersonasEnSelect();
  cargarGastosYResumen();
  calcularTransferencias();
});
