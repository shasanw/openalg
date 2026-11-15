// Runs the mitex Typst plugin (mitex.wasm from @preview/mitex) directly from
// JS, implementing Typst's tiny wasm-minimal-protocol host. This is the browser
// twin of `mitex::convert_math` in src-tauri/src/pdf.rs: LaTeX in, Typst math
// source out, converted once per distinct snippet and cached.
const enc = new TextEncoder();
const dec = new TextDecoder();

export class MitexHost {
  private exports!: WebAssembly.Exports & {
    memory: WebAssembly.Memory;
    convert_math: (a: number, b: number) => number;
  };
  private args: Uint8Array[] = [];
  private result = new Uint8Array();
  private cache = new Map<string, string>();

  static async load(bytes: BufferSource): Promise<MitexHost> {
    const host = new MitexHost();
    const { instance } = await WebAssembly.instantiate(bytes, {
      typst_env: {
        wasm_minimal_protocol_write_args_to_buffer: (ptr: number) => {
          const mem = new Uint8Array(host.exports.memory.buffer);
          let off = ptr;
          for (const a of host.args) {
            mem.set(a, off);
            off += a.length;
          }
        },
        wasm_minimal_protocol_send_result_to_host: (ptr: number, len: number) => {
          host.result = new Uint8Array(host.exports.memory.buffer, ptr, len).slice();
        },
      },
    });
    host.exports = instance.exports as MitexHost["exports"];
    return host;
  }

  /** LaTeX math -> Typst math body (without the surrounding `$`). Memoized. */
  convertMath(latex: string): string {
    const hit = this.cache.get(latex);
    if (hit !== undefined) return hit;
    const input = enc.encode(latex);
    const spec = new Uint8Array();
    this.args = [input, spec];
    const code = this.exports.convert_math(input.length, spec.length);
    const out = dec.decode(this.result);
    if (code !== 0) throw new Error(`mitex: ${out}`);
    this.cache.set(latex, out);
    return out;
  }
}
