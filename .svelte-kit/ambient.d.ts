
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/private';
 * 
 * console.log(ENVIRONMENT); // => "production"
 * console.log(PUBLIC_BASE_URL); // => throws error during build
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/private' {
	export const CURL_CA_BUNDLE: string;
	export const NODE_EXTRA_CA_CERTS: string;
	export const WRAPPER_LOG_PATH: string;
	export const npm_config_user_agent: string;
	export const KILO_AUTH_CONTENT: string;
	export const AGENT: string;
	export const GH_TOKEN: string;
	export const KILOCODE_BACKEND_BASE_URL: string;
	export const KILOCODE_TOKEN: string;
	export const npm_node_execpath: string;
	export const GIT_SSL_CAINFO: string;
	export const XDG_CACHE_HOME: string;
	export const SHLVL: string;
	export const npm_config_noproxy: string;
	export const HOME: string;
	export const GIT_CONFIG_COUNT: string;
	export const OLDPWD: string;
	export const KILO_PROCESS_ROLE: string;
	export const npm_package_json: string;
	export const KILO_API_URL: string;
	export const CLOUDFLARE_LOCATION: string;
	export const KILO_BACKGROUND_PROCESS_ID: string;
	export const SSL_CERT_FILE: string;
	export const npm_config_userconfig: string;
	export const npm_config_local_prefix: string;
	export const XDG_STATE_HOME: string;
	export const KILO_RUN_ID: string;
	export const COLOR: string;
	export const KILOCODE_VERSION: string;
	export const SANDBOX_INTERCEPT_HTTPS: string;
	export const CLOUDFLARE_NODE_ID: string;
	export const CLOUDFLARE_REGION: string;
	export const _: string;
	export const npm_config_prefix: string;
	export const npm_config_npm_version: string;
	export const OPENCODE_CONFIG_CONTENT: string;
	export const TERM: string;
	export const npm_config_cache: string;
	export const OPENCODE: string;
	export const GIT_CONFIG_VALUE_0: string;
	export const KILO_DISABLE_CODEBASE_INDEXING: string;
	export const npm_config_node_gyp: string;
	export const PATH: string;
	export const KILO: string;
	export const GIT_CONFIG_VALUE_1: string;
	export const REQUESTS_CA_BUNDLE: string;
	export const NODE: string;
	export const npm_package_name: string;
	export const XDG_RUNTIME_DIR: string;
	export const KILO_EXPERIMENTAL_BACKGROUND_SUBAGENTS: string;
	export const LANG: string;
	export const XDG_DATA_HOME: string;
	export const XDG_CONFIG_HOME: string;
	export const KILO_PID: string;
	export const npm_lifecycle_script: string;
	export const CLOUDFLARE_DURABLE_OBJECT_ID: string;
	export const KILOCODE_FEATURE: string;
	export const DEBIAN_FRONTEND: string;
	export const KILO_PLATFORM: string;
	export const GIT_TERMINAL_PROMPT: string;
	export const npm_package_version: string;
	export const npm_lifecycle_event: string;
	export const CONTROL_SANDBOX_PROVIDER: string;
	export const GIT_CONFIG_KEY_0: string;
	export const GIT_CONFIG_KEY_1: string;
	export const CONTROL_PLANE_NATIVE_LOGS: string;
	export const KILO_DISABLE_AUTOUPDATE: string;
	export const npm_config_globalconfig: string;
	export const npm_config_init_module: string;
	export const PWD: string;
	export const KILO_OPENROUTER_BASE: string;
	export const KILO_DEBUG_SESSION_INGEST: string;
	export const CONTROL_PLANE_ALLOCATION_ID: string;
	export const LC_ALL: string;
	export const npm_execpath: string;
	export const KILO_SESSION_INGEST_URL: string;
	export const npm_config_global_prefix: string;
	export const npm_config_allow_scripts: string;
	export const npm_command: string;
	export const CONTROL_WORKLOAD_LIMIT_MB: string;
	export const CLOUDFLARE_PLACEMENT_ID: string;
	export const KILO_TREE_SITTER_WASM_DIR: string;
	export const INIT_CWD: string;
	export const EDITOR: string;
	export const NODE_ENV: string;
}

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/public';
 * 
 * console.log(ENVIRONMENT); // => throws error during build
 * console.log(PUBLIC_BASE_URL); // => "http://site.com"
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * 
 * console.log(env.ENVIRONMENT); // => "production"
 * console.log(env.PUBLIC_BASE_URL); // => undefined
 * ```
 */
declare module '$env/dynamic/private' {
	export const env: {
		CURL_CA_BUNDLE: string;
		NODE_EXTRA_CA_CERTS: string;
		WRAPPER_LOG_PATH: string;
		npm_config_user_agent: string;
		KILO_AUTH_CONTENT: string;
		AGENT: string;
		GH_TOKEN: string;
		KILOCODE_BACKEND_BASE_URL: string;
		KILOCODE_TOKEN: string;
		npm_node_execpath: string;
		GIT_SSL_CAINFO: string;
		XDG_CACHE_HOME: string;
		SHLVL: string;
		npm_config_noproxy: string;
		HOME: string;
		GIT_CONFIG_COUNT: string;
		OLDPWD: string;
		KILO_PROCESS_ROLE: string;
		npm_package_json: string;
		KILO_API_URL: string;
		CLOUDFLARE_LOCATION: string;
		KILO_BACKGROUND_PROCESS_ID: string;
		SSL_CERT_FILE: string;
		npm_config_userconfig: string;
		npm_config_local_prefix: string;
		XDG_STATE_HOME: string;
		KILO_RUN_ID: string;
		COLOR: string;
		KILOCODE_VERSION: string;
		SANDBOX_INTERCEPT_HTTPS: string;
		CLOUDFLARE_NODE_ID: string;
		CLOUDFLARE_REGION: string;
		_: string;
		npm_config_prefix: string;
		npm_config_npm_version: string;
		OPENCODE_CONFIG_CONTENT: string;
		TERM: string;
		npm_config_cache: string;
		OPENCODE: string;
		GIT_CONFIG_VALUE_0: string;
		KILO_DISABLE_CODEBASE_INDEXING: string;
		npm_config_node_gyp: string;
		PATH: string;
		KILO: string;
		GIT_CONFIG_VALUE_1: string;
		REQUESTS_CA_BUNDLE: string;
		NODE: string;
		npm_package_name: string;
		XDG_RUNTIME_DIR: string;
		KILO_EXPERIMENTAL_BACKGROUND_SUBAGENTS: string;
		LANG: string;
		XDG_DATA_HOME: string;
		XDG_CONFIG_HOME: string;
		KILO_PID: string;
		npm_lifecycle_script: string;
		CLOUDFLARE_DURABLE_OBJECT_ID: string;
		KILOCODE_FEATURE: string;
		DEBIAN_FRONTEND: string;
		KILO_PLATFORM: string;
		GIT_TERMINAL_PROMPT: string;
		npm_package_version: string;
		npm_lifecycle_event: string;
		CONTROL_SANDBOX_PROVIDER: string;
		GIT_CONFIG_KEY_0: string;
		GIT_CONFIG_KEY_1: string;
		CONTROL_PLANE_NATIVE_LOGS: string;
		KILO_DISABLE_AUTOUPDATE: string;
		npm_config_globalconfig: string;
		npm_config_init_module: string;
		PWD: string;
		KILO_OPENROUTER_BASE: string;
		KILO_DEBUG_SESSION_INGEST: string;
		CONTROL_PLANE_ALLOCATION_ID: string;
		LC_ALL: string;
		npm_execpath: string;
		KILO_SESSION_INGEST_URL: string;
		npm_config_global_prefix: string;
		npm_config_allow_scripts: string;
		npm_command: string;
		CONTROL_WORKLOAD_LIMIT_MB: string;
		CLOUDFLARE_PLACEMENT_ID: string;
		KILO_TREE_SITTER_WASM_DIR: string;
		INIT_CWD: string;
		EDITOR: string;
		NODE_ENV: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://example.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.ENVIRONMENT); // => undefined, not public
 * console.log(env.PUBLIC_BASE_URL); // => "http://example.com"
 * ```
 * 
 * ```
 * 
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
