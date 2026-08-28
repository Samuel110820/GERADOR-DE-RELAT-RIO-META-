# Gerador de relatório de Meta Ads

Interface para transformar prints do Gerenciador de Anúncios em um relatório HTML de página única, pronto para entregar ao cliente ou imprimir em PDF pelo navegador.

## Como funciona

1. **Dados e imagens** — cliente, período, responsável, objetivo real da conta, logo, prints e prévias do criativo.
2. **Números** — a leitura dos prints devolve três tabelas editáveis, uma por nível. Confira linha a linha contra o print: é isso que vai para o relatório.
3. **Reconciliação** — a soma dos conjuntos e dos anúncios é conferida contra a campanha em JavaScript, sem passar pelo modelo. Frequência, CPM, CTR e custo por resultado são recalculados. As divergências viram notas de rodapé.
4. **Relatório** — o texto é escrito em três chamadas encadeadas e o HTML é montado no próprio app, com as imagens embutidas em base64.

O modelo escreve o texto. Os números são calculados ou digitados por você.

## Rodar na sua máquina

```bash
npm install
cp .env.example .env.local   # e coloque a sua chave
npx vercel dev               # sobe o front e a função /api junto
```

`npm run dev` sozinho serve só o front, e a chamada para `/api/claude` falha. Use `npx vercel dev` para ter os dois.

## Publicar na Vercel

1. Suba a pasta para um repositório no GitHub.
2. Na Vercel: **Add New → Project**, importe o repositório. O preset Vite é detectado sozinho.
3. Em **Settings → Environment Variables**, crie `ANTHROPIC_API_KEY` com a chave do console da Anthropic. Marque os três ambientes (Production, Preview, Development).
4. **Deploy**. A cada `git push` a Vercel republica.

A chave vive só na função de servidor (`api/claude.js`). Ela nunca chega ao navegador. Não mova essa chamada para o front: quem abrir a página conseguiria copiar a chave e gastar na sua conta.

## Custo

A hospedagem cabe no plano gratuito da Vercel. O gasto real é o uso da API, cobrado na sua conta da Anthropic — cada relatório são quatro chamadas, sendo a primeira com as imagens dos prints, que é a mais cara.

## Ajustes comuns

- **Modelo**: constante `MODEL` no topo de `src/App.jsx`.
- **Paleta e fontes**: objeto `C` e as constantes `DISPLAY` e `BODY`, no mesmo arquivo.
- **Estrutura do relatório**: função `montarHtml`, que concentra todo o HTML e o CSS da entrega.
- **Tom e regras do texto**: constante `sistema`, dentro da função `escrever`.
- **Timeout**: a função está em 60 segundos (`maxDuration`). No plano gratuito o teto é esse; se a leitura de prints muito grandes estourar, reduza o tamanho das imagens antes de subir.

## Limite conhecido

A leitura automática erra em coluna com número pequeno ou print comprimido. A etapa 2 é conferência de verdade, não formalidade.
