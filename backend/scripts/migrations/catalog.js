// Only structural metadata is read; never rows, credentials, or sequence values.
const SQL = `
WITH objects AS (
 SELECT 'relation' kind, c.relname name,
 jsonb_build_object('kind', c.relkind, 'persistence', c.relpersistence,
 'rls', c.relrowsecurity, 'forceRls', c.relforcerowsecurity,
 'options',c.reloptions,'view',CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid) ELSE NULL END) definition
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S')
 UNION ALL
 SELECT 'column', c.relname || '.' || a.attname,
 jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,
 'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,
 'collation',co.collname)
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 LEFT JOIN pg_collation co ON co.oid=a.attcollation
 WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL
 SELECT 'constraint', c.relname || '.' || con.conname,
 jsonb_build_object('sql',pg_get_constraintdef(con.oid),'validated',con.convalidated)
 FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 UNION ALL
 SELECT 'index', i.relname, jsonb_build_object('sql',pg_get_indexdef(i.oid),
 'valid',x.indisvalid,'ready',x.indisready)
 FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
 JOIN pg_namespace n ON n.oid=i.relnamespace WHERE n.nspname='public'
 UNION ALL
 SELECT 'trigger', c.relname || '.' || t.tgname,
 jsonb_build_object('sql',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
 UNION ALL
 SELECT 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
 jsonb_build_object('sql',pg_get_functiondef(p.oid))
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind IN ('f','p')
 UNION ALL
 SELECT 'sequence', c.relname, jsonb_build_object('type',format_type(s.seqtypid,NULL),
 'start',s.seqstart,'increment',s.seqincrement,'min',s.seqmin,'max',s.seqmax,'cache',s.seqcache,
 'cycle',s.seqcycle,'ownerTable',o.relname,'ownerColumn',a.attname)
 FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_depend d ON d.objid=c.oid AND d.classid='pg_class'::regclass AND d.deptype IN ('a','i')
 LEFT JOIN pg_class o ON o.oid=d.refobjid LEFT JOIN pg_attribute a ON a.attrelid=o.oid AND a.attnum=d.refobjsubid
 WHERE n.nspname='public'
 UNION ALL
 SELECT 'policy', c.relname || '.' || p.polname,
 jsonb_build_object('command',p.polcmd,'permissive',p.polpermissive,
 'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 UNION ALL
 SELECT 'rule',c.relname || '.' || r.rulename,jsonb_build_object('sql',pg_get_ruledef(r.oid))
 FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 UNION ALL
 SELECT 'inheritance',c.relname || '.' || p.relname,jsonb_build_object('order',i.inhseqno)
 FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid JOIN pg_class p ON p.oid=i.inhparent
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 UNION ALL
 SELECT 'type', t.typname, jsonb_build_object('kind',t.typtype)
 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
 WHERE n.nspname='public' AND t.typrelid=0 AND t.typelem=0
)
SELECT kind,name,definition FROM objects ORDER BY kind,name`;

async function catalog(client) {
    return (await client.query(SQL)).rows.filter(row => {
        if (['column','constraint'].includes(row.kind)) return !row.name.startsWith('pgmigrations.');
        if (row.kind === 'relation') return !['pgmigrations','pgmigrations_id_seq'].includes(row.name);
        if (row.kind === 'index') return row.name !== 'pgmigrations_pkey';
        if (row.kind === 'sequence') return row.name !== 'pgmigrations_id_seq';
        return true;
    });
}

function differences(actual, expected) {
    const key = row => `${row.kind}:${row.name}`;
    const a = new Map(actual.map(row => [key(row), JSON.stringify(row.definition)]));
    const e = new Map(expected.map(row => [key(row), JSON.stringify(row.definition)]));
    return [...new Set([...a.keys(), ...e.keys()])].sort().filter(k => a.get(k) !== e.get(k));
}
module.exports = { catalog, differences };
