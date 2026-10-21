// Generated from contracts/openapi.json; run npm run generate:api.
export interface paths {
    "/compare": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Compare */
        get: operations["compare_runs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/experiments/{experiment}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Experiment Results */
        get: operations["get_experiment"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Run */
        post: operations["create_run"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runs/{run_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Run */
        get: operations["get_run"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runs/{run_id}/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Health */
        get: operations["get_health"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runs/{run_id}/kpis": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kpis */
        get: operations["get_kpis"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runs/{run_id}/network": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Network */
        get: operations["get_network"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runs/{run_id}/query": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Query Nodes */
        post: operations["query_nodes"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runs/{run_id}/timeseries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Timeseries */
        get: operations["get_timeseries"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scenarios": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Scenarios */
        get: operations["list_scenarios"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** ApiError */
        ApiError: {
            /** Detail */
            detail: string;
            /** Issues */
            issues?: string[];
        };
        /** BullwhipConfig */
        BullwhipConfig: {
            /**
             * Batching
             * @default true
             */
            batching?: boolean;
            /**
             * Pos Sharing
             * @default false
             */
            pos_sharing?: boolean;
            /**
             * Price
             * @default false
             */
            price?: boolean;
            /**
             * Rationing
             * @default false
             */
            rationing?: boolean;
            /**
             * Signal Processing
             * @default true
             */
            signal_processing?: boolean;
        };
        /** Comparison */
        Comparison: {
            costs: components["schemas"]["CostComparison"];
            /** Metrics */
            metrics: {
                [key: string]: components["schemas"]["Estimate"];
            };
            /** Replications */
            replications: number;
            /** Run A */
            run_a: string;
            /** Run B */
            run_b: string;
        };
        /** CostComparison */
        CostComparison: {
            /** A */
            a: (number | null)[];
            /** B */
            b: (number | null)[];
            /** Ci95 High */
            ci95_high: (number | null)[];
            /** Ci95 Low */
            ci95_low: (number | null)[];
            /** Component */
            component: string[];
            /** Delta */
            delta: (number | null)[];
        };
        /** DemandConfig */
        DemandConfig: {
            /**
             * Cv Scale
             * @default 1
             */
            cv_scale?: number;
            /**
             * Regional Rho
             * @default 0.3
             */
            regional_rho?: number;
            /**
             * Seasonality
             * @default monthly_index_v1
             * @constant
             */
            seasonality?: "monthly_index_v1";
        };
        /** Disruption */
        Disruption: {
            /** Duration */
            duration: number;
            /**
             * Magnitude
             * @description Removed capacity fraction for outage/cut; discount fraction for promo; multiplier otherwise.
             */
            magnitude: number;
            /** Start Day */
            start_day: number;
            /** Target */
            target: string;
            /**
             * Type
             * @enum {string}
             */
            type: "supplier_outage" | "lead_time_multiplier" | "demand_shock" | "capacity_cut" | "moq_change" | "price_promo";
        };
        /** Edges */
        Edges: {
            /** Distance Km */
            distance_km: number[];
            /** Flow Units */
            flow_units: number[];
            /** Id */
            id: string[];
            /** Source */
            source: string[];
            /** Target */
            target: string[];
        };
        /** Estimate */
        Estimate: {
            /** Ci95 */
            ci95?: number[] | null;
            /** Mean */
            mean: number | null;
        };
        /** ExperimentResults */
        ExperimentResults: {
            /** Case Id */
            case_id: string[];
            /** Config Hash */
            config_hash: string;
            /**
             * Experiment
             * @enum {string}
             */
            experiment: "E1" | "E2" | "E3" | "E4" | "E5" | "E6";
            /** Metric */
            metric: string[];
            /** Offset */
            offset: number;
            /** Phase */
            phase: ("validation" | "screen" | "confirm" | "calibration" | "evaluation")[];
            /** Replication */
            replication: number[];
            /** Seed */
            seed: number[];
            /** Total */
            total: number;
            /** Value */
            value: (number | null)[];
        };
        /** Health */
        Health: {
            /** Days */
            days: number[];
            /** Days Of Cover */
            days_of_cover: (number | null)[][];
            /** Node Ids */
            node_ids: string[];
            /** Run Id */
            run_id: string;
            /** Stockout */
            stockout: boolean[][];
        };
        /** Kpis */
        Kpis: {
            /** Metrics */
            metrics: {
                [key: string]: components["schemas"]["Estimate"];
            };
            /** Node Id */
            node_id?: string | null;
            /** Replications */
            replications: number;
            /** Run Id */
            run_id: string;
        };
        /** Network */
        Network: {
            edges: components["schemas"]["Edges"];
            nodes: components["schemas"]["Nodes"];
            /** Run Id */
            run_id: string;
        };
        /** NetworkConfig */
        NetworkConfig: {
            /**
             * Dc Count
             * @default 4
             * @enum {integer}
             */
            dc_count?: 1 | 2 | 4 | 8;
            /** Suppliers */
            suppliers?: string[];
        };
        /** Nodes */
        Nodes: {
            /** Id */
            id: string[];
            /** Label */
            label: string[];
            /** Latitude */
            latitude: number[];
            /** Longitude */
            longitude: number[];
            /** Type */
            type: ("supplier" | "dc" | "retailer" | "b2b")[];
        };
        /** PolicyConfig */
        PolicyConfig: {
            /**
             * Default
             * @default QR
             * @enum {string}
             */
            default?: "QR" | "sS" | "RS" | "order_up_to";
            /**
             * Segmentation
             * @default abc_xyz_v1
             * @constant
             */
            segmentation?: "abc_xyz_v1";
            /**
             * Target Csl
             * @default 0.95
             */
            target_csl?: number;
        };
        /** Query */
        Query: {
            /**
             * Metric
             * @enum {string}
             */
            metric: "days_of_cover" | "fill_rate" | "on_hand" | "on_order" | "backorders";
            /** Node Type */
            node_type?: ("supplier" | "dc" | "retailer" | "b2b") | null;
            /**
             * Operator
             * @enum {string}
             */
            operator: "lt" | "le" | "eq" | "ge" | "gt";
            /** Value */
            value: number;
        };
        /** QueryRequest */
        QueryRequest: {
            /** Day */
            day?: number | null;
            filter?: components["schemas"]["Query"] | null;
            /** Text */
            text?: string | null;
        };
        /** QueryResults */
        QueryResults: {
            /** Day */
            day: number;
            filter: components["schemas"]["Query"];
            /** Node Ids */
            node_ids: string[];
            /** Node Types */
            node_types: ("supplier" | "dc" | "retailer" | "b2b")[];
            /** Run Id */
            run_id: string;
            /** Values */
            values: number[];
        };
        /** RunNetwork */
        RunNetwork: {
            kpis: components["schemas"]["Kpis"];
            network: components["schemas"]["Network"];
            /** Sku Ids */
            sku_ids: string[];
        };
        /** RunOptions */
        RunOptions: {
            /**
             * Bullwhip
             * @default false
             */
            bullwhip?: boolean;
            /**
             * Forecasting
             * @default false
             */
            forecasting?: boolean;
            /**
             * Lost Sales
             * @default false
             */
            lost_sales?: boolean;
            /**
             * Segmented
             * @default false
             */
            segmented?: boolean;
        };
        /** RunRequest */
        RunRequest: {
            options?: components["schemas"]["RunOptions"];
            overrides?: components["schemas"]["ScenarioOverrides"];
            /**
             * Preset
             * @default base_4dc
             */
            preset?: string;
            /**
             * Replications
             * @default 1
             */
            replications?: number;
            /**
             * Seed
             * @default 0
             */
            seed?: number;
        };
        /** RunStatus */
        RunStatus: {
            /** Error */
            error?: string | null;
            /** Replications */
            replications: number;
            /** Representative Seed */
            representative_seed: number;
            /** Run Id */
            run_id: string;
            /** Seed */
            seed: number;
            /**
             * Status
             * @enum {string}
             */
            status: "queued" | "running" | "complete" | "failed";
        };
        /** Scenario */
        Scenario: {
            bullwhip?: components["schemas"]["BullwhipConfig"];
            demand?: components["schemas"]["DemandConfig"];
            /** Disruptions */
            disruptions?: components["schemas"]["Disruption"][];
            /**
             * Horizon Days
             * @default 365
             */
            horizon_days?: number;
            network?: components["schemas"]["NetworkConfig"];
            policy?: components["schemas"]["PolicyConfig"];
            /**
             * Replications
             * @default 30
             */
            replications?: number;
            /** Scenario */
            scenario: string;
            /**
             * Warmup Days
             * @default 90
             */
            warmup_days?: number;
        };
        /** ScenarioCatalog */
        ScenarioCatalog: {
            /** Presets */
            presets: {
                [key: string]: components["schemas"]["Scenario"];
            };
        };
        /** ScenarioOverrides */
        ScenarioOverrides: {
            bullwhip?: components["schemas"]["BullwhipConfig"] | null;
            demand?: components["schemas"]["DemandConfig"] | null;
            /** Disruptions */
            disruptions?: components["schemas"]["Disruption"][] | null;
            /** Horizon Days */
            horizon_days?: number | null;
            network?: components["schemas"]["NetworkConfig"] | null;
            policy?: components["schemas"]["PolicyConfig"] | null;
            /** Warmup Days */
            warmup_days?: number | null;
        };
        /** TimeSeries */
        TimeSeries: {
            /** Days */
            days: number[];
            /** Metrics */
            metrics: {
                [key: string]: (number | null)[];
            };
            /** Node Id */
            node_id: string;
            /** Run Id */
            run_id: string;
            /** Sku Id */
            sku_id: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    compare_runs: {
        parameters: {
            query: {
                a: string;
                b: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Comparison"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    get_experiment: {
        parameters: {
            query?: {
                offset?: number;
                limit?: number | null;
                case_id?: string | null;
                metric?: string | null;
            };
            header?: never;
            path: {
                experiment: "E1" | "E2" | "E3" | "E4" | "E5" | "E6";
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExperimentResults"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    create_run: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RunRequest"];
            };
        };
        responses: {
            /** @description Cached completed run */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunStatus"];
                };
            };
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunStatus"];
                };
            };
            /** @description Queued or running replication job */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunStatus"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    get_run: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunStatus"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    get_health: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Health"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    get_kpis: {
        parameters: {
            query?: {
                node?: string | null;
            };
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Kpis"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    get_network: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunNetwork"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    query_nodes: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QueryRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QueryResults"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    get_timeseries: {
        parameters: {
            query: {
                node: string;
                sku: string;
                metrics?: ("days_of_cover" | "fill_rate" | "on_hand" | "on_order" | "backorders")[] | null;
                start_day?: number | null;
                end_day?: number | null;
            };
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimeSeries"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    list_scenarios: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScenarioCatalog"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
}
