import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { getLastSystemError } from "@/lib/dataStore";

/**
 * Tela TEMPORÁRIA de diagnóstico (somente admin, via /admin/diagnostico).
 * - Status da conexão Supabase
 * - Última sincronização (boot do dataStore)
 * - Quantidade de registros por tabela
 * - Teste de gravação/leitura (tabela "visits")
 */

const TABLES = [
  "products",
  "categories",
  "catalogs",
  "launches",
  "companies",
  "brand_rules",
  "panic_brands",
  "visits",
  "contacts",
  "password_recoveries",
  "access_requests",
  "profiles",
  "orders",
  "order_items",
  "quote_requests",
] as const;

type TableStat = { table: string; count: number | null; status: string; ok: boolean };

export default function Diagnostics() {
  const [connOk, setConnOk] = useState<boolean | null>(null);
  const [stats, setStats] = useState<TableStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<string>("—");
  const [rwResult, setRwResult] = useState<string>("Não testado");
  const sysErr = getLastSystemError();

  const runScan = useCallback(async () => {
    setLoading(true);
    setLastSync(new Date().toLocaleString("pt-BR"));
    // Conexão
    try {
      const { error } = await supabase.from("products").select("id").limit(1);
      setConnOk(!error);
    } catch {
      setConnOk(false);
    }
    // Contagens
    const results: TableStat[] = [];
    for (const t of TABLES) {
      try {
        const { count, error } = await supabase
          .from(t)
          .select("*", { count: "exact", head: true });
        results.push({
          table: t,
          count: count ?? null,
          status: error ? error.message : "OK",
          ok: !error,
        });
      } catch (e: any) {
        results.push({ table: t, count: null, status: e?.message || "erro", ok: false });
      }
    }
    setStats(results);
    setLoading(false);
  }, []);

  const runReadWriteTest = useCallback(async () => {
    setRwResult("Testando…");
    try {
      const probe = `__diag_${Date.now()}`;
      const { error: insErr } = await supabase
        .from("visits")
        .insert({ path: probe, ref: "diagnostico" });
      if (insErr) {
        setRwResult(`❌ Gravação falhou: ${insErr.message}`);
        return;
      }
      const { data, error: readErr } = await supabase
        .from("visits")
        .select("id, path")
        .eq("path", probe)
        .limit(1);
      if (readErr) {
        setRwResult(`⚠️ Gravou, mas leitura falhou: ${readErr.message}`);
        return;
      }
      const row = data?.[0];
      if (row?.id) {
        await supabase.from("visits").delete().eq("id", row.id);
        setRwResult("✅ Gravação + leitura + exclusão OK (tabela visits)");
      } else {
        setRwResult("⚠️ Gravou mas não encontrou o registro na leitura");
      }
    } catch (e: any) {
      setRwResult(`❌ Erro: ${e?.message || String(e)}`);
    }
  }, []);

  useEffect(() => {
    void runScan();
  }, [runScan]);

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Diagnóstico Supabase</h1>
            <p className="text-sm text-muted-foreground">
              Tela temporária — somente administradores.
            </p>
          </div>
          <Link to="/admin/painel" className="text-sm text-primary underline">
            ← Voltar ao painel
          </Link>
        </header>

        {/* Status da conexão */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">Conexão Supabase</p>
            <p className="text-lg font-semibold">
              {connOk === null ? "…" : connOk ? "🟢 Online" : "🔴 Offline"}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">Última sincronização</p>
            <p className="text-lg font-semibold">{lastSync}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">Último erro de sync</p>
            <p className="text-sm font-medium">
              {sysErr ? `${sysErr.op} ${sysErr.table}` : "Nenhum"}
            </p>
          </div>
        </section>

        {/* Teste leitura/gravação */}
        <section className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="font-semibold">Teste de gravação e leitura</h2>
            <button
              onClick={runReadWriteTest}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
            >
              Executar teste
            </button>
          </div>
          <p className="text-sm">{rwResult}</p>
        </section>

        {/* Contagens por tabela */}
        <section className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="font-semibold">Registros por tabela</h2>
            <button
              onClick={runScan}
              disabled={loading}
              className="rounded-md border border-border px-3 py-1.5 text-sm"
            >
              {loading ? "Atualizando…" : "Atualizar"}
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3">Tabela</th>
                <th className="p-3">Registros</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.table} className="border-t border-border">
                  <td className="p-3 font-mono">{s.table}</td>
                  <td className="p-3">{s.count ?? "—"}</td>
                  <td className="p-3">
                    <span className={s.ok ? "text-green-600" : "text-destructive"}>
                      {s.ok ? "OK" : s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="text-xs text-muted-foreground">
          Observação: contagens podem aparecer como 0 para tabelas protegidas por RLS
          quando lidas com sessão sem permissão. Faça login como admin para leituras completas.
        </p>
      </div>
    </div>
  );
}
