Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ── Rutas ─────────────────────────────────────────────────────────────────────
$BASE_DIR = $PSScriptRoot
$SCRIPT   = Join-Path $BASE_DIR "generar_informe.js"
$NODE_EXE = (Get-Command node -ErrorAction SilentlyContinue).Source

if (-not $NODE_EXE) {
    [System.Windows.Forms.MessageBox]::Show(
        "Node.js no encontrado en el PATH.`nInstala Node.js y vuelve a intentarlo.",
        "Error de entorno",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    exit 1
}

# ── Paleta y fuentes ──────────────────────────────────────────────────────────
$CLR_BG      = [System.Drawing.Color]::FromArgb(245, 246, 248)
$CLR_HEADER  = [System.Drawing.Color]::FromArgb(26,  26,  46)
$CLR_SEC     = [System.Drawing.Color]::FromArgb(44,  62,  80)
$CLR_INPUT   = [System.Drawing.Color]::White
$CLR_BTN     = [System.Drawing.Color]::FromArgb(192, 57,  43)
$CLR_BTN_HOV = [System.Drawing.Color]::FromArgb(231, 76,  60)
$CLR_TXT_LT  = [System.Drawing.Color]::White
$CLR_HINT    = [System.Drawing.Color]::FromArgb(160, 160, 160)

$FNT_BODY    = New-Object System.Drawing.Font("Segoe UI", 9.5)
$FNT_LABEL   = New-Object System.Drawing.Font("Segoe UI", 9.5)
$FNT_SECTION = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Bold)
$FNT_TITLE   = New-Object System.Drawing.Font("Segoe UI", 12,  [System.Drawing.FontStyle]::Bold)
$FNT_BTN     = New-Object System.Drawing.Font("Segoe UI", 12,  [System.Drawing.FontStyle]::Bold)

# ── Formulario ────────────────────────────────────────────────────────────────
$form                    = New-Object System.Windows.Forms.Form
$form.Text               = "Control de Mermas — Alimentos El Hortelano"
$form.ClientSize         = New-Object System.Drawing.Size(460, 610)
$form.FormBorderStyle    = "FixedSingle"
$form.MaximizeBox        = $false
$form.StartPosition      = "CenterScreen"
$form.BackColor          = $CLR_BG
$form.Font               = $FNT_BODY

# ── Header ────────────────────────────────────────────────────────────────────
$pnlHeader           = New-Object System.Windows.Forms.Panel
$pnlHeader.Dock      = "Top"
$pnlHeader.Height    = 56
$pnlHeader.BackColor = $CLR_HEADER
$form.Controls.Add($pnlHeader)

$lblTitle            = New-Object System.Windows.Forms.Label
$lblTitle.Text       = "REGISTRO DIARIO DE MERMAS"
$lblTitle.Font       = $FNT_TITLE
$lblTitle.ForeColor  = $CLR_TXT_LT
$lblTitle.Dock       = "Fill"
$lblTitle.TextAlign  = "MiddleCenter"
$pnlHeader.Controls.Add($lblTitle)

# ── Panel de contenido ────────────────────────────────────────────────────────
$pnlBody           = New-Object System.Windows.Forms.Panel
$pnlBody.Location  = New-Object System.Drawing.Point(0, 56)
$pnlBody.Size      = New-Object System.Drawing.Size(460, 554)
$pnlBody.BackColor = $CLR_BG
$pnlBody.AutoScroll = $false
$form.Controls.Add($pnlBody)

# ── Helpers ───────────────────────────────────────────────────────────────────
function Add-Label {
    param($parent, $text, $x, $y, $w = 148, $h = 22)
    $lbl           = New-Object System.Windows.Forms.Label
    $lbl.Text      = $text
    $lbl.Location  = New-Object System.Drawing.Point($x, ($y + 3))
    $lbl.Size      = New-Object System.Drawing.Size($w, $h)
    $lbl.TextAlign = "MiddleLeft"
    $lbl.ForeColor = [System.Drawing.Color]::FromArgb(60, 60, 60)
    $parent.Controls.Add($lbl)
    return $lbl
}

function Add-Input {
    param($parent, $x, $y, $w = 264, $hint = "", $numOnly = $false)
    $txt             = New-Object System.Windows.Forms.TextBox
    $txt.Location    = New-Object System.Drawing.Point($x, $y)
    $txt.Size        = New-Object System.Drawing.Size($w, 26)
    $txt.BackColor   = $CLR_INPUT
    $txt.BorderStyle = "FixedSingle"
    $txt.Font        = $FNT_BODY

    if ($hint -ne "") {
        $txt.Tag       = $hint
        $txt.Text      = $hint
        $txt.ForeColor = $CLR_HINT
        $txt.Add_Enter({
            if ($this.ForeColor -eq $CLR_HINT -and $this.Text -eq $this.Tag) {
                $this.Text      = ""
                $this.ForeColor = [System.Drawing.Color]::Black
            }
        })
        $txt.Add_Leave({
            if ($this.Text.Trim() -eq "") {
                $this.Text      = $this.Tag
                $this.ForeColor = $CLR_HINT
            }
        })
    }

    if ($numOnly) {
        $txt.Add_KeyPress({
            $e = $args[1]
            $c = $e.KeyChar
            if (-not [char]::IsControl($c) -and -not [char]::IsDigit($c) -and $c -ne '.') {
                $e.Handled = $true
            }
        })
    }

    $parent.Controls.Add($txt)
    return $txt
}

function Add-Section {
    param($parent, $title, $y)
    $pnl           = New-Object System.Windows.Forms.Panel
    $pnl.Location  = New-Object System.Drawing.Point(10, $y)
    $pnl.Size      = New-Object System.Drawing.Size(440, 24)
    $pnl.BackColor = $CLR_SEC
    $parent.Controls.Add($pnl)

    $lbl           = New-Object System.Windows.Forms.Label
    $lbl.Text      = "  " + $title.ToUpper()
    $lbl.Font      = $FNT_SECTION
    $lbl.ForeColor = $CLR_TXT_LT
    $lbl.Dock      = "Fill"
    $lbl.TextAlign = "MiddleLeft"
    $pnl.Controls.Add($lbl)
}

# ── Controles ─────────────────────────────────────────────────────────────────
# Fila: Cliente
Add-Label    -parent $pnlBody -text "Cliente:" -x 14 -y 10
$cmbCliente              = New-Object System.Windows.Forms.ComboBox
$cmbCliente.Location     = New-Object System.Drawing.Point(164, 8)
$cmbCliente.Size         = New-Object System.Drawing.Size(282, 26)
$cmbCliente.DropDownStyle = "DropDownList"
$cmbCliente.Font          = $FNT_BODY
$cmbCliente.Items.AddRange(@("El Hortelano (Eladio)", "Monda Gazpacho"))
$cmbCliente.SelectedIndex = 0
$pnlBody.Controls.Add($cmbCliente)

# Fila: Fecha
Add-Label   -parent $pnlBody -text "Fecha (DD/MM/YYYY):" -x 14 -y 44
$txtFecha = Add-Input -parent $pnlBody -x 164 -y 42 -w 160
$txtFecha.Text      = (Get-Date -Format "dd/MM/yyyy")
$txtFecha.ForeColor = [System.Drawing.Color]::Black

# Sección: Tomate
Add-Section -parent $pnlBody -title "Recepción de tomate bruto" -y 78
Add-Label   -parent $pnlBody -text "Kilos recibidos:"   -x 14 -y 112
$txtKe = Add-Input  -parent $pnlBody -x 164 -y 110 -numOnly $true
Add-Label   -parent $pnlBody -text "Nº Albarán:"        -x 14 -y 146
$txtAe = Add-Input  -parent $pnlBody -x 164 -y 144

# Sección: Gazpacho
Add-Section -parent $pnlBody -title "Gazpacho expedido" -y 182
Add-Label   -parent $pnlBody -text "Litros expedidos:"  -x 14 -y 216
$txtLg = Add-Input  -parent $pnlBody -x 164 -y 214 -numOnly $true
Add-Label   -parent $pnlBody -text "Nº Albarán:"        -x 14 -y 250
$txtAg = Add-Input  -parent $pnlBody -x 164 -y 248
Add-Label   -parent $pnlBody -text "% Merma:"           -x 14 -y 284
$txtMg = Add-Input  -parent $pnlBody -x 164 -y 282 -w 80 -numOnly $true -hint "5"

$lblHintG          = New-Object System.Windows.Forms.Label
$lblHintG.Text     = "vacío = 5% por defecto"
$lblHintG.Location = New-Object System.Drawing.Point(250, 287)
$lblHintG.Size     = New-Object System.Drawing.Size(190, 18)
$lblHintG.ForeColor = $CLR_HINT
$lblHintG.Font     = New-Object System.Drawing.Font("Segoe UI", 8.5)
$pnlBody.Controls.Add($lblHintG)

# Sección: Salmorejo
Add-Section -parent $pnlBody -title "Salmorejo expedido" -y 316
Add-Label   -parent $pnlBody -text "Kilos expedidos:"   -x 14 -y 350
$txtKs = Add-Input  -parent $pnlBody -x 164 -y 348 -numOnly $true
Add-Label   -parent $pnlBody -text "Nº Albarán:"        -x 14 -y 384
$txtAs = Add-Input  -parent $pnlBody -x 164 -y 382
Add-Label   -parent $pnlBody -text "% Merma:"           -x 14 -y 418
$txtMs = Add-Input  -parent $pnlBody -x 164 -y 416 -w 80 -numOnly $true -hint "5"

$lblHintS          = New-Object System.Windows.Forms.Label
$lblHintS.Text     = "vacío = 5% por defecto"
$lblHintS.Location = New-Object System.Drawing.Point(250, 421)
$lblHintS.Size     = New-Object System.Drawing.Size(190, 18)
$lblHintS.ForeColor = $CLR_HINT
$lblHintS.Font     = New-Object System.Drawing.Font("Segoe UI", 8.5)
$pnlBody.Controls.Add($lblHintS)

# ── Botón Registrar ───────────────────────────────────────────────────────────
$btnRegistrar            = New-Object System.Windows.Forms.Button
$btnRegistrar.Text       = "REGISTRAR"
$btnRegistrar.Location   = New-Object System.Drawing.Point(14, 464)
$btnRegistrar.Size       = New-Object System.Drawing.Size(432, 54)
$btnRegistrar.BackColor  = $CLR_BTN
$btnRegistrar.ForeColor  = $CLR_TXT_LT
$btnRegistrar.Font       = $FNT_BTN
$btnRegistrar.FlatStyle  = "Flat"
$btnRegistrar.FlatAppearance.BorderSize  = 0
$btnRegistrar.FlatAppearance.MouseOverBackColor = $CLR_BTN_HOV
$btnRegistrar.Cursor     = [System.Windows.Forms.Cursors]::Hand
$pnlBody.Controls.Add($btnRegistrar)

# ── Lógica del botón ──────────────────────────────────────────────────────────
$btnRegistrar.Add_Click({

    # Leer valores (limpiar hints)
    function Val([System.Windows.Forms.TextBox]$c) {
        if ($c.ForeColor -eq $CLR_HINT) { return "" }
        return $c.Text.Trim()
    }

    $cliente  = if ($cmbCliente.SelectedIndex -eq 0) { "eladio" } else { "monda" }
    $fecha    = $txtFecha.Text.Trim()
    $keVal    = Val $txtKe
    $aeVal    = Val $txtAe
    $lgVal    = Val $txtLg
    $agVal    = Val $txtAg
    $mgVal    = Val $txtMg
    $ksVal    = Val $txtKs
    $asVal    = Val $txtAs
    $msVal    = Val $txtMs

    # Validación rápida de fecha
    if ($fecha -notmatch '^\d{2}/\d{2}/\d{4}$') {
        [System.Windows.Forms.MessageBox]::Show(
            "La fecha debe tener el formato DD/MM/YYYY.",
            "Fecha incorrecta",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        return
    }

    # Al menos una operación con valor mayor que 0
    $hayEntrada  = $keVal -ne "" -and [double]::TryParse($keVal,  [ref]$null) -and [double]$keVal  -gt 0
    $hayGaz      = $lgVal -ne "" -and [double]::TryParse($lgVal,  [ref]$null) -and [double]$lgVal  -gt 0
    $haySal      = $ksVal -ne "" -and [double]::TryParse($ksVal,  [ref]$null) -and [double]$ksVal  -gt 0

    if (-not $hayEntrada -and -not $hayGaz -and -not $haySal) {
        [System.Windows.Forms.MessageBox]::Show(
            "Introduce al menos un valor mayor que 0:`n• Kilos de tomate recibidos`n• Litros de gazpacho`n• Kilos de salmorejo",
            "Datos incompletos",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        return
    }

    # Construir lista de argumentos para Node
    $argList = [System.Collections.Generic.List[string]]::new()
    $argList.Add("`"$SCRIPT`"")
    $argList.Add("--cliente"); $argList.Add($cliente)
    $argList.Add("--fecha");   $argList.Add($fecha)

    if ($hayEntrada) {
        $argList.Add("--ke"); $argList.Add($keVal)
        if ($aeVal -ne "") { $argList.Add("--ae"); $argList.Add("`"$aeVal`"") }
    }
    if ($hayGaz) {
        $argList.Add("--lg"); $argList.Add($lgVal)
        if ($agVal -ne "") { $argList.Add("--ag"); $argList.Add("`"$agVal`"") }
        if ($mgVal -ne "") { $argList.Add("--mg"); $argList.Add($mgVal) }
    }
    if ($haySal) {
        $argList.Add("--ks"); $argList.Add($ksVal)
        if ($asVal -ne "") { $argList.Add("--as"); $argList.Add("`"$asVal`"") }
        if ($msVal -ne "") { $argList.Add("--ms"); $argList.Add($msVal) }
    }

    $argStr = $argList -join " "

    # Deshabilitar botón durante ejecución
    $btnRegistrar.Enabled = $false
    $btnRegistrar.Text    = "Procesando..."
    $form.Refresh()

    # Ejecutar Node sin ventana de consola — capturar stdout + stderr
    try {
        $psi                        = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName               = $NODE_EXE
        $psi.Arguments              = $argStr
        $psi.WorkingDirectory       = $BASE_DIR
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError  = $true
        $psi.UseShellExecute        = $false
        $psi.CreateNoWindow         = $true

        $proc   = [System.Diagnostics.Process]::Start($psi)
        $stdout = $proc.StandardOutput.ReadToEnd()
        $stderr = $proc.StandardError.ReadToEnd()
        $proc.WaitForExit()
        $exitCode = $proc.ExitCode
        $output   = ($stdout + $stderr).Trim()
    }
    catch {
        $exitCode = 1
        $output   = $_.Exception.Message
    }
    finally {
        $btnRegistrar.Enabled = $true
        $btnRegistrar.Text    = "REGISTRAR"
    }

    if ($exitCode -eq 0) {
        [System.Windows.Forms.MessageBox]::Show(
            $output,
            "Registro completado",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information
        ) | Out-Null

        # Limpiar campos tras éxito
        foreach ($c in @($txtKe, $txtAe, $txtLg, $txtAg, $txtKs, $txtAs)) { $c.Text = "" }
        $txtMg.Text = $txtMg.Tag; $txtMg.ForeColor = $CLR_HINT
        $txtMs.Text = $txtMs.Tag; $txtMs.ForeColor = $CLR_HINT
        $txtFecha.Text = (Get-Date -Format "dd/MM/yyyy")
    }
    else {
        [System.Windows.Forms.MessageBox]::Show(
            $output,
            "Error en el registro",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    }
})

# ── Mostrar ventana ───────────────────────────────────────────────────────────
[System.Windows.Forms.Application]::EnableVisualStyles()
$form.ShowDialog() | Out-Null
