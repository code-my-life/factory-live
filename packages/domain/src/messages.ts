/**
 * Un texte que factory-live fabrique lui-même : un code et ses paramètres, que le client écrit dans
 * la langue choisie. Le catalogue fait foi dans les contrats (`Message` de `@factory-live/contracts`) ;
 * le serveur vérifie à la compilation que le domaine n'émet que des codes de ce catalogue.
 */
export interface Message<C extends string = string, P extends object = NoParams> {
  readonly code: C;
  readonly params: P;
}

export type NoParams = Readonly<Record<never, never>>;

/** Un texte affiché : écrit ailleurs (agent, outil, kanban), montré tel quel, ou fabriqué ici. */
export type Text<M extends Message<string, object>> = string | M;

export function message<const C extends string>(code: C): Message<C>;
export function message<const C extends string, const P extends object>(
  code: C,
  params: P,
): Message<C, P>;
export function message(code: string, params: object = {}): Message<string, object> {
  return { code, params };
}
