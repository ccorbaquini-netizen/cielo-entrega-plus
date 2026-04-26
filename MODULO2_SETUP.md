# Cielo Entrega+ — Guia de Configuração
## Módulo 2: Scanner + Geolocalização + Tokens

> **Pré-requisito:** O Módulo 1 já deve estar funcionando em produção
> (cadastro, painel e deploy no Netlify concluídos).

---

## O QUE O MÓDULO 2 ADICIONA

- **Scanner de código de barras (Code 128)** — câmera do celular lê a etiqueta
- **Geolocalização automática** — GPS capturado para validar presença em caso de falha
- **Edge Function `validar-entrega`** — consulta a Intelipost e calcula os tokens
- **Tabela `scans`** — registro de todas as entregas com anti-fraude
- **Botão "Registrar Entrega"** no painel do entregador
- **Logo Entrega+App** em todas as telas
- **Foto do entregador** no header do painel (redonda, com borda lime)
- **Hero centralizado** na tela inicial com logo no eyebrow

---

## PASSO 1 — ATUALIZAR OS ARQUIVOS DO PROJETO

### 1.1 Substituir os arquivos

Extraia o arquivo `.zip` do Módulo 2 que você recebeu.
Copie **todos os arquivos** para dentro da pasta do projeto, substituindo os existentes.

> ⚠️ Não apague a pasta `node_modules` nem o arquivo `.env` — apenas substitua os demais arquivos.

### 1.2 Verificar os novos arquivos

Após copiar, confirme que estes arquivos existem na pasta do projeto:

```
src/
  components/
    Logo.jsx                          ← NOVO
  pages/
    Scanner.jsx                       ← NOVO
    Landing.jsx                       ← ATUALIZADO
    Dashboard.jsx                     ← ATUALIZADO
    App.jsx                           ← ATUALIZADO
supabase/
  functions/
    validar-entrega/
      index.ts                        ← NOVA EDGE FUNCTION
  sql_modulo2_scans.sql               ← NOVO SQL
MODULO2_SETUP.md                      ← ESTE ARQUIVO
```

---

## PASSO 2 — CRIAR A TABELA DE SCANS NO SUPABASE

### 2.1 Acessar o SQL Editor

1. Acesse **supabase.com** e faça login
2. Abra o projeto **cielo-entrega-plus**
3. No menu lateral esquerdo, clique em **SQL Editor**
4. Clique em **New query** (botão no canto superior direito)

### 2.2 Executar o SQL

Copie e cole o conteúdo abaixo na área de texto e clique em **Run** (ou pressione Ctrl+Enter):

```sql
-- Tabela principal de scans
CREATE TABLE IF NOT EXISTS public.scans (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_pedido       text NOT NULL,
  cpf_entregador      text NOT NULL,
  status_intelipost   text,
  status              text DEFAULT 'reservado'
                      CHECK (status IN ('reservado','liberado','cancelado')),
  tokens_creditados   integer DEFAULT 0,
  situacao            text,
  lat_scan            double precision,
  lng_scan            double precision,
  accuracy_metros     double precision,
  distancia_metros    double precision,
  geo_situacao        text,
  geo_mensagem        text,
  modo_simulacao      boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Índice anti-fraude: impede scan duplicado do mesmo pedido/entregador
CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_pedido_cpf
  ON public.scans (numero_pedido, cpf_entregador)
  WHERE status != 'reservado';

-- Índice para busca por entregador
CREATE INDEX IF NOT EXISTS idx_scan_cpf_created
  ON public.scans (cpf_entregador, created_at DESC);

-- Trigger updated_at
CREATE TRIGGER trg_scans_updated
  BEFORE UPDATE ON public.scans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scan_select_proprio" ON public.scans
  FOR SELECT USING (true);

CREATE POLICY "scan_service_write" ON public.scans
  FOR ALL USING (auth.role() = 'service_role');

-- Grants
GRANT SELECT ON public.scans TO anon;
GRANT ALL ON public.scans TO service_role;
```

### 2.3 Confirmar que funcionou

Após clicar em **Run**, deve aparecer a mensagem:
```
Success. No rows returned
```

Para confirmar que a tabela foi criada:
1. No menu lateral, clique em **Table Editor**
2. A tabela **scans** deve aparecer na lista

---

## PASSO 3 — INSTALAR A SUPABASE CLI

A CLI é necessária para fazer deploy da Edge Function.

### 3.1 Verificar se já está instalada

No terminal (Prompt de Comando no Windows, Terminal no Mac):

```bash
supabase --version
```

Se aparecer um número de versão (ex: `1.200.3`), pule para o Passo 4.
Se aparecer "comando não encontrado", instale conforme abaixo.

### 3.2 Instalar no Windows

Opção mais simples — via npm (já que o Node.js está instalado):

```bash
npm install -g supabase
```

Aguarde a instalação terminar e verifique:

```bash
supabase --version
```

> Se o npm não funcionar, acesse https://supabase.com/docs/guides/cli/getting-started
> e baixe o instalador `.exe` para Windows.

### 3.3 Instalar no Mac

```bash
brew install supabase/tap/supabase
```

> Se não tiver o Homebrew: acesse https://brew.sh e siga as instruções de instalação (leva ~5 minutos).

---

## PASSO 4 — FAZER LOGIN NA SUPABASE CLI

### 4.1 Gerar o token de acesso

1. Acesse **supabase.com** e faça login
2. Clique no ícone do seu perfil no canto superior direito
3. Clique em **Access Tokens**
4. Clique em **Generate new token**
5. Dê um nome (ex: `cli-local`) e clique em **Generate token**
6. **Copie o token gerado** — ele só aparece uma vez

### 4.2 Fazer login no terminal

No terminal, dentro da pasta do projeto:

```bash
supabase login
```

Cole o token quando solicitado e pressione Enter.

Deve aparecer:
```
You are now logged in. Happy building!
```

---

## PASSO 5 — CONECTAR A CLI AO PROJETO SUPABASE

### 5.1 Encontrar o Project Reference ID

1. No painel do Supabase, clique em **Settings** (engrenagem no menu lateral)
2. Clique em **General**
3. Copie o **Reference ID** — é uma sequência como `tynxdwaaedkdnmksfycf`

### 5.2 Linkar o projeto

No terminal, dentro da pasta do projeto:

```bash
supabase link --project-ref SEU_REFERENCE_ID
```

Substitua `SEU_REFERENCE_ID` pelo valor copiado acima. Exemplo:

```bash
supabase link --project-ref tynxdwaaedkdnmksfycf
```

Quando pedir a senha do banco de dados, digite a senha que você criou ao configurar o Supabase no Módulo 1 e pressione Enter.

> ⚠️ A senha não fica visível enquanto você digita — isso é normal.

Deve aparecer:
```
Finished supabase link.
```

---

## PASSO 6 — DEPLOY DA EDGE FUNCTION

### 6.1 Fazer o deploy

No terminal, dentro da pasta do projeto:

```bash
supabase functions deploy validar-entrega
```

Aguarde. O processo leva cerca de 30 segundos. Deve aparecer:

```
Deployed Functions on project tynxdwaaedkdnmksfycf: validar-entrega
```

### 6.2 Confirmar no painel

1. No painel do Supabase, clique em **Edge Functions** no menu lateral
2. A função **validar-entrega** deve aparecer na lista com status **Active**

---

## PASSO 7 — CONFIGURAR O SECRET DA INTELIPOST

> ⚠️ Se a API Key da Intelipost ainda não chegou, **pule este passo**.
> O sistema funciona em modo simulação automaticamente — retorna "entregue"
> para qualquer pedido, perfeito para testes.

### 7.1 Quando a API Key chegar

No painel do Supabase:
1. Clique em **Edge Functions** no menu lateral
2. Clique na função **validar-entrega**
3. Clique na aba **Secrets**
4. Clique em **Add secret**
5. Preencha:
   - **Name:** `INTELIPOST_API_KEY`
   - **Value:** sua chave da Intelipost
6. Clique em **Save**

### 7.2 Desativar o modo simulação

Após configurar a API Key:
1. Acesse o app em `entregamaisapp.com.br/admin`
2. Faça login com a senha admin
3. Na seção **Intelipost API**, desmarque a opção **Modo Simulação**
4. Clique em **Salvar**

---

## PASSO 8 — ATUALIZAR O PROJETO NO GITHUB E NETLIFY

### 8.1 Commitar as alterações

No terminal, dentro da pasta do projeto:

```bash
git add .
git commit -m "feat: módulo 2 — scanner + geolocalização + tokens"
git push
```

### 8.2 Aguardar o deploy no Netlify

1. Acesse **netlify.com** e abra seu site
2. Clique em **Deploys** no menu superior
3. Aguarde o deploy mais recente ficar com status **Published** (leva 1-2 minutos)

---

## PASSO 9 — VERIFICAÇÃO FINAL

Acesse `entregamaisapp.com.br` e confirme:

- [ ] Logo **Entrega+App** aparece no header (branco+lime+azul)
- [ ] Na tela inicial, o eyebrow mostra "PROGRAMA DE INCENTIVO" + logo lado a lado
- [ ] Texto abaixo do headline está centralizado
- [ ] No painel do entregador, a foto aparece redonda no header (canto direito)
- [ ] O botão **"Registrar Entrega"** aparece no painel
- [ ] Ao clicar em "Registrar Entrega", a tela do scanner abre
- [ ] O botão **"Abrir câmera"** pede permissão de câmera ao clicar
- [ ] A câmera abre e exibe a mira de leitura
- [ ] A entrada manual aceita um número de pedido e processa
- [ ] Após processar, aparece a tela de resultado com tokens

---

## LÓGICA DE TOKENS

| Situação | Tokens | Por quê |
|----------|--------|---------|
| Entrega confirmada (DELIVERED) | **10** | Entregue com sucesso |
| Falha + endereço sem geocodificação | **10** | Falha cadastral — não penaliza o entregador |
| Falha + GPS dentro do raio | **4** | Tentativa presencial comprovada |
| Falha + GPS fora do raio | **0** | Sem evidência de presença no endereço |
| Pedido em trânsito | **0 (reservado)** | Scan antes da hora |
| Pedido cancelado/perdido | **0** | Pedido encerrado |

**Raios adaptativos:**
| Tipo de endereço | Raio aceito |
|------------------|-------------|
| Residencial / casa | 200 metros |
| CEP único / condomínio grande | 500 metros |
| Rural / zona industrial | 1.000 metros |

---

## ANTI-FRAUDE

- Um mesmo pedido **não pode ser escaneado duas vezes** pelo mesmo entregador
- A geolocalização é **obrigatória para crédito de tokens em casos de falha**
- Todos os scans são gravados no banco com `modo_simulacao: true/false`
- O índice único no banco bloqueia duplicatas antes mesmo de chegar à lógica de negócio

---

## MODO SIMULAÇÃO

Enquanto a API Key da Intelipost não chegar, o modo simulação:
- Retorna `DELIVERED` para qualquer número de pedido digitado
- Credita **10 tokens** automaticamente
- Grava `modo_simulacao: true` no banco para rastreabilidade
- Pode ser testado com qualquer texto no campo "Número do Pedido"

---

## SOLUÇÃO DE PROBLEMAS

**"Não foi possível acessar a câmera"**
→ O app precisa de HTTPS para acessar a câmera. Em produção (entregamaisapp.com.br) funciona normalmente. Em localhost, use `npm run dev` — o Vite aceita câmera em localhost.

**"GPS negado ou indisponível"**
→ O entregador negou a permissão de localização. O app continua funcionando — para entregas confirmadas credita 10 tokens normalmente. Para falhas, aplica a lógica `sem_gps`.

**"Este pedido já foi registrado"**
→ Anti-fraude funcionando corretamente. O mesmo pedido não pode ser escaneado duas vezes.

**"Erro ao processar a entrega"**
→ Verifique se a Edge Function foi deployada (Passo 6) e se aparece como **Active** no painel do Supabase.

**Deploy falhou no Netlify**
→ Clique no deploy com erro → veja os logs → procure pela linha vermelha. O erro mais comum é variável de ambiente não configurada.

---

## SUPORTE

- Logs da Edge Function: Supabase → **Edge Functions** → **validar-entrega** → **Logs**
- Logs do banco: Supabase → **Logs** → **API Logs**
- Logs de build: Netlify → **Deploys** → clique no deploy
