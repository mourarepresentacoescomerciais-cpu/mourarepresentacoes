# Setup Supabase — passo único (faz tudo de uma vez)

## 1) Authentication → Providers → Email
- **Enable Email provider** ✅
- **Confirm email** ❌ (desmarcado)

## 2) Authentication → Users → Add user
- Email: `admin@moura.local`
- Password: `Moura1990.`
- **Auto Confirm User** ✅

## 3) Database → SQL Editor → New Query
Cole e execute o **`supabase/SETUP.sql`** inteiro. Pode rodar quantas vezes quiser — é idempotente.

A última query devolve 1 linha com `role = admin`. Se devolver 0, refaça o passo 2 e rode o SQL de novo.

## O que o SETUP.sql faz
- Cria todas as tabelas, enums, triggers, policies de RLS e buckets de storage.
- **Remove o FK `profiles_id_fkey`** (era ele que impedia o admin de cadastrar clientes/leads pelo painel).
- Faz seed das marcas (Cortag, Ilumi, Claw Motobombas, Plaspol).
- Promove `admin@moura.local` a `role = 'admin'` em `public.profiles`.

## Como funciona o login depois disso
- **Admin** (`admin@moura.local` / `Moura1990.`) → autenticado pelo Supabase Auth.
- **Clientes / Leads** cadastrados pelo painel → o admin define CNPJ + senha; o login funciona via fallback local + sincroniza o cadastro no Supabase para o admin enxergar de qualquer dispositivo.

## Se um salvamento falhar
O app agora mostra um **toast vermelho** com a mensagem real do Supabase. Se aparecer "row-level security", seu usuário admin não foi promovido — rode novamente o passo 3.
