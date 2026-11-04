# Busca de manuais PDF

Aplicativo Flask responsivo para localizar manuais PDF por texto ou voz. A busca digitada e o filtro por marca atualizam a lista instantaneamente, sem recarregar a página. A busca por voz em português abre o PDF encontrado em um visualizador na mesma página, com botão para fechar; se houver vários resultados, eles são apresentados para escolha. Os links dos resultados usam o mesmo visualizador.

O botão de tema no topo alterna entre os modos claro e escuro, salva a preferência e, na primeira visita, acompanha o tema do sistema.

## Executar no Windows

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
py app.py
```

Abra `http://127.0.0.1:5000`. Toque no microfone e diga o modelo, por exemplo, “V trinta Elite”. A pesquisa considera outras transcrições possíveis e reconhece números falados por extenso. Ela requer um navegador compatível com Web Speech API e acesso ao microfone; fora de `localhost`, normalmente é necessário usar HTTPS. Também é possível pesquisar digitando.

Por padrão, os PDFs são lidos das pastas de manuais em `Downloads`. Os arquivos permanecem nas pastas originais e são abertos pelo aplicativo sem serem copiados.

Para usar outras pastas, configure as variáveis de ambiente antes de iniciar:

```powershell
$env:MANUAL_DIRS = 'C:\Manuais\Marca A;C:\Manuais\Marca B'
py app.py
```

`MANUAL_DIRS` recebe uma lista de pastas separadas por ponto e vírgula no Windows. Cada pasta vira uma opção de marca nos filtros.
