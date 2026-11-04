# Busca de manuais

Site estático responsivo para localizar manuais por texto, filtro ou voz. A busca por voz entende nomes de números em português, encontra manuais por qualquer palavra ou número reconhecido (inclusive o número final dentro de códigos como V20), considera até dez alternativas do reconhecimento e corrige trocas comuns da primeira letra de códigos quando o código correspondente existe no catálogo e não há um modelo exato com o código reconhecido. Ela oferece os resultados mais prováveis e abre automaticamente uma correspondência única. Os PDFs permanecem na pasta pública do Google Drive e são visualizados na própria página.

## Publicar no GitHub Pages

O site não precisa de Flask para ser publicado. O catálogo está em `data/manuals.json`; os arquivos PDF não são enviados ao GitHub.

1. No GitHub, abra **Settings → Pages** e selecione **GitHub Actions** como origem da publicação.
2. Envie as alterações para a branch `main`. O workflow `.github/workflows/pages.yml` publicará o site automaticamente.
3. Aguarde a conclusão do workflow e abra o endereço mostrado em **Settings → Pages**.

Os manuais no Drive precisam continuar compartilhados publicamente para que os visitantes possam visualizá-los. A busca por voz depende de um navegador compatível com Web Speech API e de permissão para usar o microfone; no GitHub Pages, a conexão HTTPS atende ao requisito de segurança do navegador.

## Executar localmente

No Windows, com Python 3.11:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
py app.py
```

Abra `http://127.0.0.1:5000`. O Flask serve a mesma interface estática e o catálogo JSON usados no GitHub Pages.

## Atualizar o catálogo

Ao adicionar, remover ou renomear manuais, atualize `data/manuals.json` com o ID público do arquivo no Drive, seu título e a marca. Cada ID deve apontar para um PDF que os visitantes tenham permissão para visualizar.
