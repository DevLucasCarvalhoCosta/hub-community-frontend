'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLazyQuery, useMutation } from '@apollo/client';
import * as z from 'zod';
import { Copy, ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/use-debounce';
import {
  DEFAULT_BODY_TEMPLATE,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_TITLE,
  PLACEHOLDERS,
  workloadHours,
  type CertificateConfigLike,
  type CertificateEventInfo,
} from '@/lib/certificate';
import { COPY_CERTIFICATE_CONFIG, GET_EVENT_BY_SLUG_OR_ID, UPSERT_CERTIFICATE_CONFIG } from '@/lib/queries';
import type {
  CertificateConfig,
  CertificateConfigInput,
  CopyCertificateConfigResponse,
  EventResponse,
  UpsertCertificateConfigResponse,
} from '@/lib/types';

const CertificatePreview = dynamic(() => import('@/components/certificate/certificate-preview'), {
  ssr: false,
  loading: () => <Skeleton className="w-full h-[420px]" />,
});

// Certificate media goes through the BFF's upload proxy (same origin as the GraphQL
// endpoint) so the frontend never talks to Strapi directly.
const BFF_UPLOAD_URL = (process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:4000/graphql').replace(/\/graphql\/?$/, '/upload');

const mediaSchema = z.object({ id: z.string().nullable(), url: z.string().nullable() });
type MediaField = z.infer<typeof mediaSchema>;
const EMPTY_MEDIA: MediaField = { id: null, url: null };

const formSchema = z.object({
  enabled: z.boolean(),
  allow_self_request: z.boolean(),
  title: z.string().max(120, 'Máximo de 120 caracteres'),
  body_template: z.string().max(1000, 'Máximo de 1000 caracteres'),
  workload_hours: z.string().regex(/^(\d+([.,]\d+)?)?$/, 'Use números, ex.: 8 ou 1,5'),
  issuer_name: z.string().max(80, 'Máximo de 80 caracteres'),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor em hexadecimal, ex.: #10B981'),
  logo: mediaSchema,
  background: mediaSchema,
  sponsors: z.array(
    z.object({
      name: z.string().min(1, 'Nome obrigatório'),
      url: z.string().optional(),
      logo: mediaSchema.refine((m) => Boolean(m.id), 'Logo obrigatório'),
    }),
  ),
  signatures: z
    .array(z.object({ name: z.string().min(1, 'Nome obrigatório'), role: z.string().optional(), image: mediaSchema }))
    .max(4, 'No máximo 4 assinaturas'),
});
type FormValues = z.infer<typeof formSchema>;

function toFormValues(config: CertificateConfig | null | undefined): FormValues {
  return {
    enabled: config?.enabled ?? false,
    allow_self_request: config?.allow_self_request ?? true,
    title: config?.title ?? '',
    body_template: config?.body_template ?? '',
    workload_hours: config?.workload_hours ? String(config.workload_hours).replace('.', ',') : '',
    issuer_name: config?.issuer_name ?? '',
    primary_color: config?.primary_color ?? DEFAULT_PRIMARY_COLOR,
    logo: { id: config?.logo_id ?? null, url: config?.logo ?? null },
    background: { id: config?.background_id ?? null, url: config?.background ?? null },
    sponsors: (config?.sponsors ?? []).map((s) => ({
      name: s.name,
      url: s.url ?? '',
      logo: { id: s.logo_id ?? null, url: s.logo ?? null },
    })),
    signatures: (config?.signatures ?? []).map((s) => ({
      name: s.name,
      role: s.role ?? '',
      image: { id: s.image_id ?? null, url: s.image ?? null },
    })),
  };
}

function parseHours(value: string): number | null {
  if (!value) return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toInput(values: FormValues): CertificateConfigInput {
  return {
    enabled: values.enabled,
    allow_self_request: values.allow_self_request,
    title: values.title,
    body_template: values.body_template,
    workload_hours: parseHours(values.workload_hours),
    issuer_name: values.issuer_name,
    primary_color: values.primary_color,
    logo: values.logo.id,
    background: values.background.id,
    sponsors: values.sponsors.map((s) => ({ name: s.name, url: s.url || undefined, logo: s.logo.id as string })),
    signatures: values.signatures.map((s) => ({ name: s.name, role: s.role || undefined, image: s.image.id })),
  };
}

function toPreviewConfig(values: FormValues): CertificateConfigLike {
  return {
    title: values.title,
    body_template: values.body_template,
    workload_hours: parseHours(values.workload_hours),
    issuer_name: values.issuer_name,
    primary_color: /^#[0-9a-fA-F]{6}$/.test(values.primary_color) ? values.primary_color : DEFAULT_PRIMARY_COLOR,
    logo: values.logo.url,
    background: values.background.url,
    sponsors: values.sponsors.map((s) => ({ name: s.name, url: s.url, logo: s.logo.url })),
    signatures: values.signatures.map((s) => ({ name: s.name, role: s.role, image: s.image.url })),
  };
}

// Surfaces a pt-BR message: prefer the BFF's own GraphQL error, then our own
// thrown pt-BR strings (upload/lookup failures), falling back to a generic
// message for network errors or anything unexpected.
function errorMessage(err: unknown): string {
  const apolloErr = err as { graphQLErrors?: { message?: string }[]; networkError?: unknown };
  if (apolloErr?.graphQLErrors?.[0]?.message) return apolloErr.graphQLErrors[0].message;
  if (apolloErr?.networkError) return 'Não foi possível concluir. Tente novamente.';
  if (err instanceof Error && err.message) return err.message;
  return 'Não foi possível concluir. Tente novamente.';
}

async function uploadImage(file: File): Promise<MediaField> {
  const data = new FormData();
  data.append('file', file);
  const res = await fetch(BFF_UPLOAD_URL, { method: 'POST', body: data });
  if (!res.ok) throw new Error('Falha no upload da imagem.');
  // The BFF returns { id, url (absolute), name }.
  const uploaded: { id: number | string; url: string } = await res.json();
  if (!uploaded?.id || !uploaded?.url) throw new Error('Falha no upload da imagem.');
  return { id: String(uploaded.id), url: uploaded.url };
}

// Small reusable image picker: shows the current image, uploads on change, clears on X.
function ImageField({ value, onChange, label, hint }: { value: MediaField; onChange: (m: MediaField) => void; label: string; hint?: string }) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const inputId = useId();
  const handleFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      onChange(await uploadImage(file));
    } catch (err) {
      toast({ variant: 'destructive', title: 'Upload falhou', description: errorMessage(err) });
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex items-center gap-3">
        {value.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value.url} alt={label} className="h-14 w-24 object-contain rounded border bg-white" />
        ) : (
          <div className="h-14 w-24 rounded border border-dashed flex items-center justify-center text-muted-foreground">
            <ImagePlus className="w-5 h-5" />
          </div>
        )}
        <Input
          id={inputId}
          type="file"
          accept="image/*"
          className="max-w-xs"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            handleFile(file);
            e.target.value = '';
          }}
        />
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {value.url ? (
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(EMPTY_MEDIA)} aria-label="Remover imagem">
            <X className="w-4 h-4" />
          </Button>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

interface CertificateConfigFormProps {
  eventId: string;
  event: CertificateEventInfo;
  initialConfig: CertificateConfig | null | undefined;
  onSaved: (config: CertificateConfig) => void;
}

export function CertificateConfigForm({ eventId, event, initialConfig, onSaved }: CertificateConfigFormProps) {
  const { toast } = useToast();
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: toFormValues(initialConfig) });
  const sponsors = useFieldArray({ control: form.control, name: 'sponsors' });
  const signatures = useFieldArray({ control: form.control, name: 'signatures' });

  useEffect(() => {
    form.reset(toFormValues(initialConfig));
  }, [initialConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  const [upsert, { loading: saving }] = useMutation<UpsertCertificateConfigResponse>(UPSERT_CERTIFICATE_CONFIG);
  const [copyConfig, { loading: copying }] = useMutation<CopyCertificateConfigResponse>(COPY_CERTIFICATE_CONFIG);
  const [findSourceEvent] = useLazyQuery<EventResponse>(GET_EVENT_BY_SLUG_OR_ID);
  const [copySource, setCopySource] = useState('');

  // Debounce a serialized snapshot: form.watch() may hand back a new object reference on
  // every render, and a string compares by value so the effect only fires on real changes.
  const watchedJson = JSON.stringify(form.watch());
  const debouncedJson = useDebounce(watchedJson, 500);
  const previewConfig = useMemo(() => toPreviewConfig(JSON.parse(debouncedJson) as FormValues), [debouncedJson]);
  const computedHours = workloadHours({ workload_hours: null }, event);

  const insertPlaceholder = (key: string) => {
    const el = document.getElementById('body_template') as HTMLTextAreaElement | null;
    const current = form.getValues('body_template');
    const pos = el?.selectionStart ?? current.length;
    const inserted = `{{${key}}}`;
    const next = `${current.slice(0, pos)}${inserted}${current.slice(pos)}`;
    form.setValue('body_template', next, { shouldDirty: true });
    const caretPos = pos + inserted.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caretPos, caretPos);
    });
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const { data } = await upsert({ variables: { eventId, data: toInput(values) } });
      if (data?.upsertCertificateConfig) {
        onSaved(data.upsertCertificateConfig);
        toast({ title: 'Modelo salvo', description: 'O modelo do certificado foi atualizado.' });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: errorMessage(err) });
    }
  };

  const handleCopy = async () => {
    if (!copySource.trim()) return;
    try {
      const { data } = await findSourceEvent({ variables: { slugOrId: copySource.trim() } });
      const fromEventId = data?.eventBySlugOrId?.documentId || data?.eventBySlugOrId?.id;
      if (!fromEventId) throw new Error('Evento de origem não encontrado.');
      const result = await copyConfig({ variables: { fromEventId, toEventId: eventId } });
      if (result.data?.copyCertificateConfig) {
        onSaved(result.data.copyCertificateConfig);
        toast({ title: 'Modelo copiado', description: `Copiado de "${data?.eventBySlugOrId?.title}". Revise e salve.` });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível copiar', description: errorMessage(err) });
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Disponibilidade</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="enabled" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel>Certificados liberados</FormLabel>
                    <FormDescription>Permite que participantes busquem e baixem o certificado.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="allow_self_request" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel>Solicitação livre</FormLabel>
                    <FormDescription>Quem não está na lista de presença pode emitir informando os dados.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
              <div className="flex items-end gap-2 pt-2">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="copy-source">Copiar modelo de outro evento</Label>
                  <Input id="copy-source" placeholder="slug ou ID do evento" value={copySource} onChange={(e) => setCopySource(e.target.value)} />
                </div>
                <Button type="button" variant="outline" onClick={handleCopy} disabled={copying || !copySource.trim()}>
                  {copying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Copy className="w-4 h-4 mr-2" />}
                  Copiar
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conteúdo</CardTitle>
              <CardDescription>Campos vazios usam o padrão.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem><FormLabel>Título</FormLabel><FormControl><Input placeholder={DEFAULT_TITLE} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="body_template" render={({ field }) => (
                <FormItem>
                  <FormLabel>Texto do certificado</FormLabel>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {PLACEHOLDERS.map((p) => (
                      <Button key={p} type="button" size="sm" variant="secondary" className="h-7 text-xs font-mono" onClick={() => insertPlaceholder(p)}>
                        {`{{${p}}}`}
                      </Button>
                    ))}
                  </div>
                  <FormControl><Textarea id="body_template" rows={5} placeholder={DEFAULT_BODY_TEMPLATE} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField control={form.control} name="workload_hours" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Carga horária (h)</FormLabel>
                    <FormControl><Input placeholder={`${computedHours} (calculada)`} inputMode="decimal" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="issuer_name" render={({ field }) => (
                  <FormItem><FormLabel>Emissor</FormLabel><FormControl><Input placeholder="Reactivando" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="primary_color" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cor principal</FormLabel>
                    <div className="flex gap-2">
                      <Input type="color" className="w-12 p-1" value={field.value} onChange={(e) => field.onChange(e.target.value.toUpperCase())} />
                      <FormControl><Input {...field} /></FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="logo" render={({ field }) => (
                <ImageField label="Logo" value={field.value} onChange={field.onChange} hint="PNG com fundo transparente, até 200×60." />
              )} />
              <FormField control={form.control} name="background" render={({ field }) => (
                <ImageField label="Fundo (opcional)" value={field.value} onChange={field.onChange} hint="A4 paisagem (ex. 2480×1754). Sem fundo, o certificado usa branco." />
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Patrocinadores</CardTitle>
              <Button type="button" size="sm" variant="outline" onClick={() => sponsors.append({ name: '', url: '', logo: EMPTY_MEDIA })}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {sponsors.fields.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum patrocinador.</p> : null}
              {sponsors.fields.map((item, index) => (
                <div key={item.id} className="rounded-lg border p-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField control={form.control} name={`sponsors.${index}.name`} render={({ field }) => (
                      <FormItem><FormLabel>Nome</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name={`sponsors.${index}.url`} render={({ field }) => (
                      <FormItem><FormLabel>Site (opcional)</FormLabel><FormControl><Input placeholder="https://" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name={`sponsors.${index}.logo`} render={({ field }) => (
                    <FormItem>
                      <ImageField label="Logo" value={field.value} onChange={field.onChange} />
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => sponsors.remove(index)}>
                    <Trash2 className="w-4 h-4 mr-1" /> Remover
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Assinaturas</CardTitle>
              <Button type="button" size="sm" variant="outline" disabled={signatures.fields.length >= 4} onClick={() => signatures.append({ name: '', role: '', image: EMPTY_MEDIA })}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {signatures.fields.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma assinatura.</p> : null}
              {signatures.fields.map((item, index) => (
                <div key={item.id} className="rounded-lg border p-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField control={form.control} name={`signatures.${index}.name`} render={({ field }) => (
                      <FormItem><FormLabel>Nome</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name={`signatures.${index}.role`} render={({ field }) => (
                      <FormItem><FormLabel>Cargo (opcional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name={`signatures.${index}.image`} render={({ field }) => (
                    <ImageField label="Assinatura digitalizada (opcional)" value={field.value} onChange={field.onChange} hint="Sem imagem, o certificado mostra só a linha com nome e cargo." />
                  )} />
                  <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => signatures.remove(index)}>
                    <Trash2 className="w-4 h-4 mr-1" /> Remover
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Button type="submit" size="lg" className="w-full" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Salvar modelo
          </Button>
        </form>
      </Form>

      <div className="xl:sticky xl:top-24 self-start space-y-2">
        <p className="text-sm text-muted-foreground">Pré-visualização (dados fictícios)</p>
        <CertificatePreview config={previewConfig} event={event} certificate={{ code: 'RCT-EXEMPLO1', name: 'Nome do Participante' }} height={420} />
      </div>
    </div>
  );
}
