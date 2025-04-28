
const { createClient } = supabase;
const supabaseUrl = 'https://nesvxvpeevvvkzamyrhz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lc3Z4dnBlZXZ2dmt6YW15cmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU4NTU2NjksImV4cCI6MjA2MTQzMTY2OX0.jMvhRGPRMeyd6AWBAvAUB6RV8lOmwul8TLIykozsKvw';
const supabaseClient = createClient(supabaseUrl, supabaseKey);

async function verificarConexionSupabase() {
    const { data, error } = await supabaseClient.from('personas').select('id_persona').limit(1);
    if (error) {
        console.error('❌ Error de conexión a Supabase:', error.message);
        alert('Error de conexión a Supabase: ' + error.message);
    } else {
        console.log('✅ Conexión a Supabase exitosa.');
    }
}

async function cargarPersonas() {
    const { data, error } = await supabaseClient.from('personas').select('*').eq('activo', true);
    if (error) return console.error(error);

    const select = document.getElementById('personaPagadora');
    select.innerHTML = '';

    data.forEach(persona => {
        const option = document.createElement('option');
        option.value = persona.id_persona;
        option.textContent = persona.nombre;
        select.appendChild(option);
    });
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

    const { error } = await supabaseClient.from('personas').insert([
        { nombre: nombrePersona }
    ]);

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

    let fotoUrl = null;

    if (foto) {
        const { data: uploadData, error: uploadError } = await supabaseClient.storage.from('tickets').upload(`tickets/${Date.now()}_${foto.name}`, foto);

        if (uploadError) {
            console.error(uploadError);
            alert('Error subiendo la imagen. Puedes intentar sin foto.');
            return;
        }

        fotoUrl = supabaseClient.storage.from('tickets').getPublicUrl(uploadData.path).publicUrl;
    }

    const { error } = await supabaseClient.from('gastos').insert([
        { descripcion, monto, persona_pagadora: personaPagadora, fecha: new Date().toISOString(), foto_ticket: fotoUrl }
    ]);

    if (error) {
        console.error(error);
    } else {
        alert('Gasto registrado exitosamente');
        await recalcularTransferencias();
        location.reload();
    }
}

async function recalcularTransferencias() {
    const { data: personas, error: errorPersonas } = await supabaseClient.from('personas').select('*').eq('activo', true);
    const { data: gastos, error: errorGastos } = await supabaseClient.from('gastos').select('*');

    if (errorPersonas || errorGastos) {
        console.error('Error cargando datos para recalcular transferencias');
        return;
    }

    const totalGastos = gastos.reduce((sum, gasto) => sum + gasto.monto, 0);
    const gastoPorPersona = totalGastos / personas.length;

    const saldos = {};

    personas.forEach(p => saldos[p.id_persona] = -gastoPorPersona);
    gastos.forEach(g => saldos[g.persona_pagadora] += g.monto);

    let deudores = Object.entries(saldos).filter(([_, saldo]) => saldo < 0).sort((a, b) => a[1] - b[1]);
    let acreedores = Object.entries(saldos).filter(([_, saldo]) => saldo > 0).sort((a, b) => b[1] - a[1]);

    await supabaseClient.from('transferencias').delete().neq('id_transferencia', '');

    while (deudores.length && acreedores.length) {
        const [idDeudor, saldoDeudor] = deudores[0];
        const [idAcreedor, saldoAcreedor] = acreedores[0];

        const montoTransferencia = Math.min(-saldoDeudor, saldoAcreedor);

        await supabaseClient.from('transferencias').insert([
            { deudor: idDeudor, acreedor: idAcreedor, monto: montoTransferencia }
        ]);

        saldos[idDeudor] += montoTransferencia;
        saldos[idAcreedor] -= montoTransferencia;

        deudores = Object.entries(saldos).filter(([_, saldo]) => saldo < -0.01).sort((a, b) => a[1] - b[1]);
        acreedores = Object.entries(saldos).filter(([_, saldo]) => saldo > 0.01).sort((a, b) => b[1] - a[1]);
    }
}

async function calcularTransferencias() {
    const { data: personas, error: errorPersonas } = await supabaseClient.from('personas').select('id_persona, nombre').eq('activo', true);
    const { data: gastos, error: errorGastos } = await supabaseClient.from('gastos').select('persona_pagadora, monto');

    if (errorPersonas || errorGastos) {
        console.error('Error cargando datos para calcular transferencias');
        return;
    }

    const totalGastos = gastos.reduce((sum, gasto) => sum + gasto.monto, 0);
    const gastoPorPersona = totalGastos / personas.length;

    const saldos = {};
    personas.forEach(p => saldos[p.id_persona] = -gastoPorPersona);
    gastos.forEach(g => saldos[g.persona_pagadora] += g.monto);

    let deudores = Object.entries(saldos).filter(([_, saldo]) => saldo < 0).sort((a, b) => a[1] - b[1]);
    let acreedores = Object.entries(saldos).filter(([_, saldo]) => saldo > 0).sort((a, b) => b[1] - a[1]);

    const lista = document.getElementById('lista-transferencias');
    lista.innerHTML = '';

    while (deudores.length && acreedores.length) {
        const [idDeudor, saldoDeudor] = deudores[0];
        const [idAcreedor, saldoAcreedor] = acreedores[0];

        const montoTransferencia = Math.min(-saldoDeudor, saldoAcreedor);

        const nombreDeudor = personas.find(p => p.id_persona === idDeudor).nombre;
        const nombreAcreedor = personas.find(p => p.id_persona === idAcreedor).nombre;

        const item = document.createElement('li');
        item.className = 'list-group-item';
        item.innerHTML = `<strong>${nombreDeudor}</strong> debe transferir <strong>$${montoTransferencia.toFixed(2)}</strong> a <strong>${nombreAcreedor}</strong>`;
        lista.appendChild(item);

        saldos[idDeudor] += montoTransferencia;
        saldos[idAcreedor] -= montoTransferencia;

        deudores = Object.entries(saldos).filter(([_, saldo]) => saldo < -0.01).sort((a, b) => a[1] - b[1]);
        acreedores = Object.entries(saldos).filter(([_, saldo]) => saldo > 0.01).sort((a, b) => b[1] - a[1]);
    }
}


async function cargarGastosYResumen() {
    const { data: gastos, error } = await supabaseClient
        .from('gastos')
        .select('id_gasto, descripcion, monto, persona_pagadora (nombre)');

    if (error) {
        console.error('Error cargando gastos:', error.message);
        return;
    }

    const resumen = document.getElementById('resumen-gastos');
    resumen.innerHTML = '';

    if (gastos.length === 0) {
        resumen.innerHTML = '<p class="text-center">No hay gastos cargados.</p>';
        return;
    }

    let total = 0;

    const table = document.createElement('table');
    table.className = 'table table-striped';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Descripción</th><th>Monto</th><th>Pagado por</th><th>Acciones</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    gastos.forEach(g => {
        total += g.monto;
        const row = document.createElement('tr');
        row.innerHTML = `
        <td>${g.descripcion}</td>
        <td>$${g.monto.toFixed(2)}</td>
        <td>${g.persona_pagadora?.nombre || 'Desconocido'}</td>
        <td><button class="btn btn-sm btn-danger" onclick="eliminarGasto('${g.id_gasto}')">Eliminar</button></td>
      `;
        tbody.appendChild(row);
    });

    const totalRow = document.createElement('tr');
    totalRow.innerHTML = `<td><strong>Total</strong></td><td><strong>$${total.toFixed(2)}</strong></td><td colspan="2"></td>`;
    tbody.appendChild(totalRow);

    table.appendChild(tbody);
    resumen.appendChild(table);

    const { data: personas, error: errorPersonas } = await supabaseClient.from('personas').select('*').eq('activo', true);
    if (!errorPersonas && personas.length > 0) {
        const totalPorPersona = document.createElement('div');
        totalPorPersona.className = 'text-center mt-2';
        totalPorPersona.innerHTML = `<strong>Cantidad de Personas:</strong> ${personas.length}`;
        resumen.appendChild(totalPorPersona);
    }
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

document.addEventListener('DOMContentLoaded', () => {
    //verificarConexionSupabase();
    cargarPersonas();
    cargarGastosYResumen();
    calcularTransferencias();
});