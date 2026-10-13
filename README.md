# AutoDrop AI

Dropshipping automatizado: **achar produtos → publicar na loja → criar anúncios → enviar pedidos ao fornecedor → atender clientes**, com painel de controle e travas de segurança de gasto.

## Começar (modo demonstração, sem chaves)
```bash
npm install
cp .env.example .env
npm run selftest   # teste de ponta a ponta com dados simulados
npm run dev        # http://localhost:3000
```
Sem chaves, tudo roda simulado e nada é publicado nem gasto.

## Ligar de verdade (nesta ordem)
1. `ADMIN_TOKEN` (senha do painel; obrigatória em produção).
2. `CJ_API_KEY` — fornecedor (CJ Dropshipping).
3. Loja: Shopify (`SHOPIFY_*`) **ou** WooCommerce (`WOO_*`) e o webhook de pedidos pagos apontando para `/webhooks/shopify` ou `/webhooks/woocommerce`.
4. `GEMINI_API_KEY` — textos e atendimento.
5. Meta Ads (`META_*`) — anúncios. Exige conta verificada, Página, Pixel e app com acesso a `ads_management`.

Rode com os padrões seguros (produtos como rascunho, anúncios pausados) e confira os primeiros ciclos em **Painel → Atividade recente**. Só depois libere `AUTO_PUBLISH_PRODUCTS` e `AUTO_ACTIVATE_ADS`.

## Como o autopiloto decide
- **Preço:** `(custo + frete + taxa fixa) / (1 − taxa% − margem-alvo%)`, terminando em ,90. Nada de preço inventado por IA.
- **ROAS de equilíbrio** por produto = preço ÷ lucro por venda antes de anúncios. Anúncio é pausado abaixo de `0,8×` esse valor (após gasto mínimo) e escalado acima de `1,3×` com compras suficientes.
- **Filtros:** estoque mínimo, faixa de preço, margem mínima, termos bloqueados (marcas, réplicas, saúde, armas…) e revisão por IA.
- **Tetos:** novos produtos/dia, orçamento diário total e por campanha. Ativar manualmente também respeita o teto.
- **Pedidos:** webhook com assinatura HMAC → registra (sem duplicar) → cria pedido na CJ → acompanha rastreio. Falhas ficam visíveis em Pedidos com botão “Tentar de novo”.

## Produção
```bash
npm run build && npm start
```
Os dados ficam em `data/db.json` (faça backup). Para vários servidores ou volume alto, troque por um banco de dados.

## Limites conhecidos
- As integrações CJ, Shopify, WooCommerce e Meta seguem a documentação oficial, mas **não foram testadas contra contas reais**; valide com 1 produto e 1 pedido de teste.
- O pagamento ao fornecedor é manual por padrão (`AUTO_PAY_SUPPLIER=false`).
- O status de entrega não é devolvido para a loja (apenas exibido no painel).
