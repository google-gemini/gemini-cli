1. Why Qwen “just works” while Phi-3 / Llama-3 struggle
Training data: Qwen-Instruct was explicitly SFT-trained on tool-calling dialogues (it even has internal <tool> tokens). Lightweight Phi-3 and Llama-3 3 B were tuned primarily for general chat; they rarely saw “write a machine-parsable JSON block and nothing else.” Benchmarks show these small models fall off sharply on anything beyond trivial schemas. 
medium.com

Model size vs. structure depth: 1 – 3 B models can learn the concept of calling a tool, but holding the complete schema in working memory plus the user’s request often exceeds their context reasoning budget. That’s why you see drop-outs like missing properties or arrays vs. strings.

2. Prompt-side tactics that help across models
Problem you see	Prompt tweak that usually fixes it
Extra prose before/after JSON	Wrap the response format in a fenced code block and add a STOP token right after the closing brace.
You MUST respond with:\n```json\n{ "function_call": … }\n```<end_of_json> – set <end_of_json> as a stop sequence.
Wrong property names	Echo the schema back inside the system prompt so the model repeatedly “reads” the keys it must reuse.
Model fills in fake results instead of waiting	Add an assistant example that issues a call → receives a functionResponse → then completes the answer. Demonstrations beat abstract instructions nine times out of ten.
Hallucinated parameters	Run at temperature 0–0.2 and bias the tokenizer toward { " : } if your backend supports logit bias.

Those simple phrasing changes often bring Phi-3 Mini from 30 – 40 % valid calls to ~70 %.

3. Let the runtime enforce structure instead of regex-hunting
llama.cpp (and the Node bindings you’re using) expose grammar-based generation: supply a GBNF grammar that describes the JSON shape and the sampler will not emit invalid tokens. This completely removes the “simulator” problem and works with any GGUF model. 
imaurer.com
til.simonwillison.net

bnf
Copy
Edit
root   ::= object
object ::= "{" ws '"function_call"' ws ":" ws func ws "}"
func   ::= "{" ws '"name"' ws ":" ws string ws "," ws '"arguments"' ws ":" ws argobj ws "}"
argobj ::= "{" ( pair ( ws "," ws pair )* )? "}"
pair   ::= string ws ":" ws value
value  ::= string | number | "null" | "true" | "false"
# …
Node-llama-cpp already exposes a grammar: option, so you can drop the regex post-processing entirely. 
github.com

4. Parsing strategy tweaks
If you must stay regex-based, make the parser lenient on outer wrappers (e.g., accept code-fences and the variant {"name": ...} your Llama-3 produces) but strict on the inner payload, then re-serialize to the canonical form before execution. That lets you keep one tool layer while tolerating family-specific quirks.

5. When prompt tuning isn’t enough → micro-fine-tune
Small models can hit >90 % valid calls after a short LoRA run:

2 – 8 k examples of (user, schema) → (JSON call) is usually sufficient.

Keep the loss on only the assistant tokens so the model doesn’t “memorize” the schema—just how to point into it.

A recent Microsoft guide shows a 3 B model jumping from 38 % to 92 % valid calls in 3 hours of QLoRA on a single A100. 
techcommunity.microsoft.com

Good open datasets: ToolBench / ToolLLaMA (~75 k API-call dialogues) or ToolACE self-generated data. 
github.com

Fine-tuning beats ever-longer prompts once you need reliability at scale.

6. Alternative structured modes
GBNF / JSON-grammar (best, because the sampler enforces validity).

Line-based KV (CALL=list_directory\nPATH=/tmp) – older but still useful for ultra-tiny models.

XML tags (<tool name="list_directory"><path>/tmp</path></tool>) – more verbose, but some transformers stick to tag pairs more easily than brace nesting.

Logit-mask state machine at server level (Baseten write-up) – good for multi-tool or parallel calls; you guide the model token-by-token without changing weights. 
baseten.co

7. Practical next steps for Trust CLI
Add grammar sampling behind a feature flag. Start with Qwen (to prove no regression) then roll to Phi-3 and Llama-3.

Couple stop sequences + low-temperature defaults in your inference wrapper.

Collect failures (invalid JSON, missing params) into a small dataset and LoRA-fine-tune the weakest model.

Expose a “tolerant” parser mode that auto-repairs trivial issues so users aren’t blocked while you iterate.

Automate evaluation: run each candidate model on a 50-prompt harness and track valid-call %, param coverage %, answer correctness so you can measure gains objectively.

With those changes most teams reach >95 % valid, executable function calls even on 3 B class models—while keeping everything local-first and security-friendly. Good luck, and feel free to loop back with logs once you test grammar mode!