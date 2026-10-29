import { CpuIcon, ServerIcon, StackIcon, TerminalIcon } from '@primer/octicons-react';
import { describe, expect, it } from 'vitest';
import { BRAND_MARKS, isBrand, laneMark, modelEditor, providerMark } from './marks.ts';

const editorOf = (model: string) => modelEditor(model)?.title ?? null;

describe('modelEditor', () => {
  it('reconnaît l’éditeur d’un modèle à son nom, préfixe d’organisation compris', () => {
    expect(editorOf('claude-opus-5-5')).toBe('Claude');
    expect(editorOf('claude-sonnet-5-5')).toBe('Claude');
    expect(editorOf('nvidia/nemotron-3-super-120b-a12b')).toBe('NVIDIA');
    expect(editorOf('Llama-3.1-Nemotron-70B-Instruct')).toBe('NVIDIA');
    expect(editorOf('gemma-3-27b-it')).toBe('Google');
    expect(editorOf('gemini-2.5-pro')).toBe('Google Gemini');
    expect(
      editorOf('Qwen3.5-9B-The-Defiant-Fable-Uncnr-Heretic-plusIQ-TOOLS-NEO-MAX-MTP-Q8_0'),
    ).toBe('QWen');
    expect(editorOf('devstral-small-2507')).toBe('Mistral AI');
    expect(editorOf('mistral-large-latest')).toBe('Mistral AI');
    expect(editorOf('meta-llama/Llama-3.3-70B-Instruct')).toBe('Meta');
    expect(editorOf('llama3.1:8b')).toBe('Meta');
    expect(editorOf('deepseek-r1')).toBe('DeepSeek');
    expect(editorOf('kimi-k2')).toBe('Moonshot AI');
  });

  it('ne devine pas : sans logo connu (OpenAI absent de Simple Icons), pas d’éditeur', () => {
    expect(editorOf('gpt-oss-20b-MXFP4')).toBeNull();
    expect(editorOf('agnes-2.5-flash')).toBeNull();
    expect(editorOf('dots3-note-preview')).toBeNull();
    expect(editorOf('auto')).toBeNull();
    expect(editorOf('mix')).toBeNull();
    expect(editorOf('ollama-proxy')).toBeNull();
  });
});

describe('providerMark', () => {
  it('donne le logo d’un fournisseur de marque, une octicon sinon', () => {
    const nvidia = providerMark('nvidia');
    expect(isBrand(nvidia) && nvidia.title).toBe('NVIDIA');
    const claude = providerMark('anthropic');
    expect(isBrand(claude) && claude.hex).toBe('#d97757');
    expect(providerMark('claude-code')).toBe(claude);
    expect(providerMark('freellmapi')).toBe(ServerIcon);
    expect(providerMark('llamacpp')).toBe(CpuIcon);
    expect(providerMark('moa')).toBe(StackIcon);
    expect(providerMark('fournisseur-inconnu')).toBe(ServerIcon);
  });

  it('marque la lane de son CLI : Claude Code, OpenCode, sinon un terminal', () => {
    const claude = laneMark('anthropic');
    expect(isBrand(claude) && claude.title).toBe('Claude');
    const opencode = laneMark('opencode');
    expect(isBrand(opencode) && opencode.title).toBe('OpenCode');
    expect(laneMark(null)).toBe(TerminalIcon);
  });
});

describe('BRAND_MARKS', () => {
  it('tient chaque logo en SVG 24 × 24 et sa couleur officielle, sans rien charger du réseau', () => {
    expect(BRAND_MARKS.length).toBeGreaterThan(5);
    for (const mark of BRAND_MARKS) {
      expect(mark.hex, mark.title).toMatch(/^#[0-9a-f]{6}$/);
      expect(mark.path, mark.title).toMatch(/^[Mm]/);
    }
  });
});
