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
    "/lab": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lab Catalog */
        get: operations["get_lab_catalog"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/lab/validate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Validate Lab Request */
        post: operations["validate_lab_request"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/models/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Builder Catalog */
        get: operations["get_builder_catalog"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/models/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Preview Model */
        post: operations["preview_model"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/portfolio": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Portfolio */
        get: operations["list_portfolio"];
        put?: never;
        /** Save Scenario */
        post: operations["save_scenario"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/portfolio/{scenario_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Update Scenario */
        put: operations["update_scenario"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/portfolio/{scenario_id}/revisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Scenario Revisions */
        get: operations["scenario_revisions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/portfolio/{scenario_id}/runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Scenario History */
        get: operations["scenario_history"];
        put?: never;
        /** Launch Scenario */
        post: operations["launch_scenario"];
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
    "/runs/{run_id}/diagnostics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Diagnostics */
        get: operations["get_diagnostics"];
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
    "/runs/{run_id}/provenance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Provenance */
        get: operations["get_provenance"];
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
    "/studies": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Study Evidence */
        get: operations["get_study_evidence"];
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
        /** BuilderCatalog */
        BuilderCatalog: {
            /** Max Observation Cells */
            max_observation_cells: number;
            request: components["schemas"]["RunRequest"];
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
        /** CanvasPosition */
        CanvasPosition: {
            /** X */
            x: number;
            /** Y */
            y: number;
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
        /** Customer */
        Customer: {
            /** Arrival Probability */
            arrival_probability: number;
            /** Demand Scale */
            demand_scale: number;
            /** Id */
            id: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "retailer" | "b2b";
            /** Label */
            label: string;
            /** Latitude */
            latitude: number;
            /** Longitude */
            longitude: number;
            /** Region */
            region: number;
            /** Shortage Penalty */
            shortage_penalty: number;
            /** Target Csl */
            target_csl: number;
        };
        /** DC */
        DC: {
            /** Annual Fixed Cost */
            annual_fixed_cost: number;
            /** Daily Capacity */
            daily_capacity: number;
            /** Handling Cost */
            handling_cost: number;
            /** Holding Rate */
            holding_rate: number;
            /** Id */
            id: string;
            /** Label */
            label: string;
            /** Latitude */
            latitude: number;
            /** Longitude */
            longitude: number;
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
        /** DiagnosticLane */
        DiagnosticLane: {
            /** Closing In Transit Units */
            closing_in_transit_units: number;
            /** Freight Inr */
            freight_inr: number;
            /** Id */
            id: string;
            /** Shipped Units */
            shipped_units: number;
            /** Source */
            source: string;
            /** Target */
            target: string;
        };
        /** DiagnosticSite */
        DiagnosticSite: {
            /** Cost Inr */
            cost_inr: number;
            /** Demand Units */
            demand_units: number;
            /** Id */
            id: string;
            /** Inventory Value Inr */
            inventory_value_inr: number;
            /**
             * Kind
             * @enum {string}
             */
            kind: "supplier" | "dc" | "retailer" | "b2b";
            /** Label */
            label: string;
            /** Shortage Units */
            shortage_units: number;
            /** Utilization */
            utilization: number | null;
        };
        /** DiagnosticSku */
        DiagnosticSku: {
            /** Demand Units */
            demand_units: number;
            /** Forecast Bias */
            forecast_bias: number | null;
            /** Forecast Wmape */
            forecast_wmape: number | null;
            /** Id */
            id: string;
            /** Inventory Value Inr */
            inventory_value_inr: number;
            /** Label */
            label: string;
            /** Shortage Units */
            shortage_units: number;
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
        /** EventControl */
        EventControl: {
            /** Maximum */
            maximum: number;
            /** Minimum */
            minimum: number;
            /** Neutral */
            neutral: number;
            /** Step */
            step: number;
            /** Target */
            target: string;
            /** Type */
            type: string;
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
        /** Inventory */
        Inventory: {
            /** Customer Holding Rate */
            customer_holding_rate: number;
            /** Customer Order Cost */
            customer_order_cost: number;
            /** Dc Order Cost */
            dc_order_cost: number;
            /** Initial Stock Fraction */
            initial_stock_fraction: number;
            /** Review Days */
            review_days: number;
        };
        /** InventoryExample */
        InventoryExample: {
            /** Annual Demand */
            annual_demand: number;
            /** Holding Cost */
            holding_cost: number;
            /** Order Cost */
            order_cost: number;
            /** Quantity */
            quantity: number;
            series: components["schemas"]["ObservationSeries"];
        };
        JsonValue: unknown;
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
        /** LabCatalog */
        LabCatalog: {
            forecast: components["schemas"]["LabSettings"];
            /** Max Horizon Days */
            max_horizon_days: number;
            /** Max Replications */
            max_replications: number;
            /** Max Warmup Days */
            max_warmup_days: number;
            /** Monthly Index */
            monthly_index: number[];
            request: components["schemas"]["RunRequest"];
            /** Seasonal Example */
            seasonal_example: number[];
            /** Sku Ids */
            sku_ids: string[];
            /** Suppliers */
            suppliers: components["schemas"]["SupplierProfile"][];
        };
        /** LabSettings */
        LabSettings: {
            /** Backup Suppliers */
            backup_suppliers?: {
                [key: string]: string;
            };
            /**
             * Buffer Days
             * @default 0
             */
            buffer_days?: number;
            /**
             * Dc Capacity Factor
             * @default 1
             */
            dc_capacity_factor?: number;
            /**
             * Expedite Factor
             * @default 1
             */
            expedite_factor?: number;
            /**
             * Expedite Unit Cost
             * @default 0
             */
            expedite_unit_cost?: number;
            /** Forecast Alpha */
            forecast_alpha?: number | null;
            /** Forecast Beta */
            forecast_beta?: number | null;
            /** Forecast Method */
            forecast_method?: ("moving_average" | "ses" | "holt") | null;
            /** Forecast Window */
            forecast_window?: number | null;
            /** Monthly Index */
            monthly_index?: number[] | null;
            /** Skus */
            skus?: {
                [key: string]: components["schemas"]["SkuAssumptions"];
            };
            /** Suppliers */
            suppliers?: {
                [key: string]: components["schemas"]["SupplierAssumptions"];
            };
        };
        /** LaneAssumptions */
        LaneAssumptions: {
            /** Delay Days */
            delay_days?: number | null;
            /** Delay Probability */
            delay_probability?: number | null;
            /** Distance Km */
            distance_km?: number | null;
            /** Lead Cv */
            lead_cv?: number | null;
            /** Lead Mean */
            lead_mean?: number | null;
            /** Source */
            source: string;
            /** Target */
            target: string;
        };
        /** LaunchRequest */
        LaunchRequest: {
            /** Execution Id */
            execution_id?: string | null;
            /** Revision */
            revision: number;
        };
        /** ModelPreview */
        ModelPreview: {
            /** Assignments */
            assignments: {
                [key: string]: string;
            };
            /** Lanes */
            lanes: components["schemas"]["LaneAssumptions"][];
            network: components["schemas"]["Network"];
            /** Open Dcs */
            open_dcs: string[];
            /** Sku Ids */
            sku_ids: string[];
            /** Warnings */
            warnings: string[];
        };
        /** ModelSnapshot */
        ModelSnapshot: {
            /**
             * Format Version
             * @default 1
             * @constant
             */
            format_version?: 1;
            /** Positions */
            positions?: {
                [key: string]: components["schemas"]["CanvasPosition"];
            };
            seasonality: components["schemas"]["Seasonality"];
            spec: components["schemas"]["NetworkSpec"];
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
             */
            dc_count?: number;
            /** Suppliers */
            suppliers?: string[];
        };
        /** NetworkSpec */
        NetworkSpec: {
            /** Assignments */
            assignments?: {
                [key: string]: string;
            };
            /** Customers */
            customers: components["schemas"]["Customer"][];
            /** Dcs */
            dcs: components["schemas"]["DC"][];
            inventory: components["schemas"]["Inventory"];
            /** Lanes */
            lanes?: components["schemas"]["LaneAssumptions"][];
            /** Open Dcs */
            open_dcs?: string[] | null;
            /** Skus */
            skus: components["schemas"]["SKU"][];
            /** Suppliers */
            suppliers: components["schemas"]["Supplier"][];
            transport: components["schemas"]["Transport"];
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
        /** ObservationSeries */
        ObservationSeries: {
            /** Columns */
            columns: {
                [key: string]: (number | null)[];
            };
            /** Days */
            days: (number)[];
            /** Label */
            label: string;
            /** Seed */
            seed?: number | null;
            /** Source */
            source: string;
        };
        /** ParameterNote */
        ParameterNote: {
            /** Parameter */
            parameter: string;
            /** Source */
            source: string;
            /** Value */
            value: string;
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
        /** PolicyTargets */
        PolicyTargets: {
            /**
             * Basis
             * @default nominal_initial_targets
             * @constant
             */
            basis?: "nominal_initial_targets";
            /** Order Quantity */
            order_quantity: number[][];
            /** Reorder Point */
            reorder_point: number[][];
        };
        /** PortfolioDraft */
        PortfolioDraft: {
            /** Name */
            name: string;
            /**
             * Notes
             * @default
             */
            notes?: string;
            request: components["schemas"]["RunRequest"];
        };
        /** PortfolioExecution */
        PortfolioExecution: {
            /** Id */
            id: string;
            /** Launched At */
            launched_at: string;
            /** Name */
            name: string;
            /** Notes */
            notes: string;
            request: components["schemas"]["RunRequest"];
            /** Revision */
            revision: number;
            /** Scenario Id */
            scenario_id: string;
            status: components["schemas"]["RunStatus"];
        };
        /** PortfolioUpdate */
        PortfolioUpdate: {
            /** Name */
            name: string;
            /**
             * Notes
             * @default
             */
            notes?: string;
            request: components["schemas"]["RunRequest"];
            /** Revision */
            revision: number;
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
        /** ResilienceExample */
        ResilienceExample: {
            event: components["schemas"]["Disruption"];
            /** Metrics */
            metrics: {
                [key: string]: number | null;
            };
            series: components["schemas"]["ObservationSeries"];
        };
        /** RunDiagnostics */
        RunDiagnostics: {
            /** Cost Components */
            cost_components: {
                [key: string]: number;
            };
            /** Facilities */
            facilities: components["schemas"]["DiagnosticSite"][];
            /** Horizon Days */
            horizon_days: number;
            /** Lanes */
            lanes: components["schemas"]["DiagnosticLane"][];
            /** Representative Seed */
            representative_seed: number;
            /** Run Id */
            run_id: string;
            /** Skus */
            skus: components["schemas"]["DiagnosticSku"][];
            /** Warmup Days */
            warmup_days: number;
        };
        /** RunNetwork */
        RunNetwork: {
            kpis: components["schemas"]["Kpis"];
            network: components["schemas"]["Network"];
            policy?: components["schemas"]["PolicyTargets"] | null;
            /** Sku Ids */
            sku_ids: string[];
            /** Warmup Days */
            warmup_days?: number | null;
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
        /** RunProvenance */
        RunProvenance: {
            /** Input Sha256 */
            input_sha256: {
                [key: string]: string;
            };
            /** Operating Snapshot */
            operating_snapshot?: {
                [key: string]: components["schemas"]["JsonValue"];
            } | null;
            /** Replication Seeds */
            replication_seeds: number[];
            request: components["schemas"]["RunRequest"];
            /** Run Id */
            run_id: string;
            scenario: components["schemas"]["Scenario"];
            /** Settings */
            settings: {
                [key: string]: components["schemas"]["JsonValue"];
            };
            /** Training Seed */
            training_seed: number;
            /** Versions */
            versions: {
                [key: string]: string;
            };
        };
        /** RunRequest */
        RunRequest: {
            lab?: components["schemas"]["LabSettings"];
            model?: components["schemas"]["ModelSnapshot"] | null;
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
        /** SKU */
        SKU: {
            /** Cv */
            cv: number;
            /** Daily Mean */
            daily_mean: number;
            /**
             * Demand Kind
             * @enum {string}
             */
            demand_kind: "normal" | "gamma";
            /** Id */
            id: string;
            /** Label */
            label: string;
            /** Moq */
            moq: number;
            /** Pack Size */
            pack_size: number;
            /** Supplier */
            supplier: string;
            /** Unit Cost */
            unit_cost: number;
            /**
             * Value Class
             * @enum {string}
             */
            value_class: "A" | "B" | "C";
        };
        /** SavedScenario */
        SavedScenario: {
            /** Created At */
            created_at: string;
            /** Id */
            id: string;
            /** Name */
            name: string;
            /**
             * Notes
             * @default
             */
            notes?: string;
            request: components["schemas"]["RunRequest"];
            /** Revision */
            revision: number;
            /** Updated At */
            updated_at: string;
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
        /** Seasonality */
        Seasonality: {
            /** Monthly Index V1 */
            monthly_index_v1: number[];
        };
        /** SkuAssumptions */
        SkuAssumptions: {
            /** Cv */
            cv?: number | null;
            /** Daily Mean */
            daily_mean?: number | null;
            /** Moq */
            moq?: number | null;
            /** Pack Size */
            pack_size?: number | null;
            /** Supplier */
            supplier?: string | null;
            /** Unit Cost */
            unit_cost?: number | null;
        };
        /** StudyCase */
        StudyCase: {
            /** Case Id */
            case_id: string;
            /** Factors */
            factors: {
                [key: string]: string | number | boolean;
            };
        };
        /** StudyDefaults */
        StudyDefaults: {
            /**
             * Alternative Dcs
             * @enum {integer}
             */
            alternative_dcs: 1 | 2 | 4 | 8;
            /**
             * Baseline Dcs
             * @enum {integer}
             */
            baseline_dcs: 1 | 2 | 4 | 8;
            /** Default Demand Cv */
            default_demand_cv: number;
            /** Default Inbound Days */
            default_inbound_days: number;
            /** Default Outbound Factor */
            default_outbound_factor: number;
            /** Default Rho */
            default_rho: number;
            /** Event Duration */
            event_duration: number;
            /** Event Start */
            event_start: number;
            /** Events */
            events: components["schemas"]["EventControl"][];
            /** Horizon Days */
            horizon_days: number;
            /** Inventory Display Days */
            inventory_display_days: number;
            /** Quantity Range */
            quantity_range: number[];
            /** Quantity Step */
            quantity_step: number;
            /** Replications */
            replications: number;
            /** Seed */
            seed: number;
            /** Warmup Days */
            warmup_days: number;
        };
        /** StudyEstimate */
        StudyEstimate: {
            /** Baseline */
            baseline?: string | null;
            /** Case Id */
            case_id: string;
            /** Countermeasure */
            countermeasure?: string | null;
            /** High */
            high: number | null;
            /** Low */
            low: number | null;
            /** Mean */
            mean: number | null;
            /** Metric */
            metric: string;
            /** Missing */
            missing: number;
            /** N */
            n: number;
            /** Phase */
            phase: string;
        };
        /** StudyEvidence */
        StudyEvidence: {
            /** Bullwhip Series */
            bullwhip_series: {
                [key: string]: components["schemas"]["ObservationSeries"];
            };
            defaults: components["schemas"]["StudyDefaults"];
            /** Experiments */
            experiments: {
                [key: string]: components["schemas"]["StudyExperiment"];
            };
            inventory: components["schemas"]["InventoryExample"];
            /** Networks */
            networks: {
                [key: string]: components["schemas"]["Network"];
            };
            pair: components["schemas"]["StudyPair"];
            /** Parameters */
            parameters: components["schemas"]["ParameterNote"][];
            /** Resilience Series */
            resilience_series: {
                [key: string]: components["schemas"]["ResilienceExample"];
            };
            theory: components["schemas"]["ObservationSeries"];
            /** Validation */
            validation: components["schemas"]["ParameterNote"][];
        };
        /** StudyExperiment */
        StudyExperiment: {
            /** Cases */
            cases: components["schemas"]["StudyCase"][];
            /** Config Hash */
            config_hash: string;
            /** Estimates */
            estimates: components["schemas"]["StudyEstimate"][];
            /** Paired Differences */
            paired_differences: components["schemas"]["StudyEstimate"][];
            /** Source */
            source: string;
        };
        /** StudyPair */
        StudyPair: {
            a: components["schemas"]["RunStatus"];
            b: components["schemas"]["RunStatus"];
            comparison: components["schemas"]["Comparison"];
            network_a: components["schemas"]["RunNetwork"];
            network_b: components["schemas"]["RunNetwork"];
        };
        /** Supplier */
        Supplier: {
            /** Daily Capacity */
            daily_capacity: number;
            /** Delay Days */
            delay_days: number;
            /** Delay Probability */
            delay_probability: number;
            /** Id */
            id: string;
            /** Label */
            label: string;
            /** Latitude */
            latitude: number;
            /** Lead Cv */
            lead_cv: number;
            /** Lead Mean */
            lead_mean: number;
            /** Longitude */
            longitude: number;
            /** Moq */
            moq: number;
            /** Price Multiplier */
            price_multiplier: number;
        };
        /** SupplierAssumptions */
        SupplierAssumptions: {
            /** Daily Capacity */
            daily_capacity?: number | null;
            /** Delay Days */
            delay_days?: number | null;
            /** Delay Probability */
            delay_probability?: number | null;
            /** Lead Cv */
            lead_cv?: number | null;
            /** Lead Mean */
            lead_mean?: number | null;
            /** Moq */
            moq?: number | null;
            /** Price Multiplier */
            price_multiplier?: number | null;
        };
        /** SupplierProfile */
        SupplierProfile: {
            /** Daily Capacity */
            daily_capacity?: number | null;
            /** Delay Days */
            delay_days?: number | null;
            /** Delay Probability */
            delay_probability?: number | null;
            /** Id */
            id: string;
            /** Label */
            label: string;
            /** Lead Cv */
            lead_cv?: number | null;
            /** Lead Mean */
            lead_mean?: number | null;
            /** Moq */
            moq?: number | null;
            /** Price Multiplier */
            price_multiplier?: number | null;
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
        /** Transport */
        Transport: {
            /** Circuity */
            circuity: number;
            /** Ftl Capacity */
            ftl_capacity: number;
            /** Ftl Fixed Cost */
            ftl_fixed_cost: number;
            /** Ftl Per Km */
            ftl_per_km: number;
            /** Km Per Day */
            km_per_day: number;
            /** Ltl Per Unit Km */
            ltl_per_unit_km: number;
            /** Outbound Handling Days */
            outbound_handling_days: number;
            /** Outbound Lead Cv */
            outbound_lead_cv: number;
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
    get_lab_catalog: {
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
                    "application/json": components["schemas"]["LabCatalog"];
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
    validate_lab_request: {
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
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunRequest"];
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
    get_builder_catalog: {
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
                    "application/json": components["schemas"]["BuilderCatalog"];
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
    preview_model: {
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
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ModelPreview"];
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
    list_portfolio: {
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
                    "application/json": components["schemas"]["SavedScenario"][];
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
    save_scenario: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PortfolioDraft"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SavedScenario"];
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
    update_scenario: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scenario_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PortfolioUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SavedScenario"];
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
    scenario_revisions: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scenario_id: string;
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
                    "application/json": components["schemas"]["SavedScenario"][];
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
    scenario_history: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scenario_id: string;
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
                    "application/json": components["schemas"]["PortfolioExecution"][];
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
    launch_scenario: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scenario_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LaunchRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PortfolioExecution"];
                };
            };
            /** @description Accepted */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PortfolioExecution"];
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
    get_diagnostics: {
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
                    "application/json": components["schemas"]["RunDiagnostics"];
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
    get_provenance: {
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
                    "application/json": components["schemas"]["RunProvenance"];
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
                metrics?: ("days_of_cover" | "fill_rate" | "on_hand" | "on_order" | "backorders" | "demand" | "immediate" | "orders" | "received" | "forecast")[] | null;
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
    get_study_evidence: {
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
                    "application/json": components["schemas"]["StudyEvidence"];
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
