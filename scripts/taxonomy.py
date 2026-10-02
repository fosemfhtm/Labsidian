"""Keyword taxonomy for tagging papers.

Two axes:
  domain  - what mobility problem the paper is about
  method  - what technique it uses
Each tag: id -> (label, [regex keywords]). Matching is case-insensitive over
title (weight 3) + content/memo (weight 1). Edit freely; rebuild to apply.
"""

DOMAINS = {
    "flow":      ("교통류·상태추정", [r"traffic flow model", r"traffic state", r"state estimation", r"\bctm\b", r"cell transmission",
                                  r"\blwr\b", r"kinematic wave", r"macroscopic", r"fundamental diagram", r"\bmfd\b", r"shockwave",
                                  r"link transmission", r"교통류", r"상태 ?추정", r"traffic oscillation"]),
    "forecast":  ("교통 예측", [r"forecast", r"traffic (flow|speed) prediction", r"spatio-?temporal", r"spatiotemporal",
                              r"traffic prediction", r"demand prediction", r"교통량 예측", r"예측 모델"]),
    "signal":    ("신호·교차로 제어", [r"signal control", r"traffic signal", r"signalized", r"intersection", r"ramp (metering|control)",
                                  r"신호 ?제어", r"교차로"]),
    "micro":     ("차선변경·차량추종", [r"lane[- ]chang", r"car[- ]following", r"\bidm\b", r"intelligent driver model",
                                  r"adaptive cruise", r"\bacc\b", r"\bmerg(e|es|ing)\b", r"차선 ?변경", r"차량 ?추종", r"headway"]),
    "human":     ("운전자 행동·인간요인", [r"driver behavio", r"driving behavio", r"driver profil", r"\btrust\b", r"takeover", r"take-over",
                                   r"human factor", r"personali[sz]", r"aggressive", r"운전자", r"driving style"]),
    "walk":      ("보행·자전거", [r"pedestrian", r"crowd", r"crosswalk", r"walk(ing|ability)?", r"cyclist", r"bicycl",
                              r"bike lane", r"vulnerable road user", r"보행", r"자전거"]),
    "safety":    ("교통 안전", [r"safety", r"crash", r"collision", r"accident", r"conflict", r"time[- ]to[- ]collision", r"\bttc\b",
                             r"risk", r"surrogate safety", r"사고", r"안전"]),
    "ad":        ("자율주행", [r"autonomous driving", r"self-driving", r"automated driving", r"end-to-end", r"motion planning",
                            r"autonomous vehicle", r"\bads\b", r"perception", r"occupancy", r"자율주행"]),
    "worldmodel": ("월드모델·시나리오 생성", [r"world model", r"scenario generation", r"scene generation", r"video generation",
                                       r"driving scene", r"scenario (generation|synthesis)", r"시나리오 생성", r"월드 ?모델"]),
    "cav":       ("CAV·V2X 협력", [r"connected (and )?automated", r"\bcavs?\b", r"\bv2x\b", r"\bv2v\b", r"cooperative", r"platoon",
                                 r"mixed traffic", r"connected vehicle", r"혼합 교통", r"군집"]),
    "ev":        ("전기차·에너지", [r"electric vehicle", r"\bevs?\b", r"charging", r"battery", r"energy", r"grid", r"photovoltaic",
                                r"renewable", r"power (grid|system)s?", r"전기차", r"충전", r"에너지"]),
    "transit":   ("대중교통·철도", [r"\btransit\b", r"public transport", r"metro", r"railway", r"\btrains?\b", r"\bbus(es)?\b", r"passenger", r"timetable", r"subway",
                                r"대중교통", r"철도", r"지하철"]),
    "freight":   ("물류·배송", [r"freight", r"delivery", r"logistic", r"vehicle routing", r"\bvrp\b", r"pick-?up and delivery",
                             r"last-mile", r"modular vehicle", r"물류", r"배송"]),
    "resilience": ("재난·회복력", [r"resilien", r"evacuat", r"disaster", r"disruption", r"vulnerab", r"hurricane", r"flood",
                                 r"earthquake", r"wildfire", r"emergency response", r"recovery", r"재난", r"대피", r"회복력"]),
    "network":   ("교통배정·네트워크", [r"traffic assignment", r"user equilibrium", r"\bdta\b", r"dynamic traffic assignment",
                                   r"network design", r"route choice", r"system optimal", r"equilibrium", r"departure time", r"commut",
                                   r"bottleneck", r"\btolls?\b", r"congestion pricing", r"origin-destination", r"통행 ?배정"]),
    "service":   ("모빌리티 서비스·수요", [r"ride-?hailing", r"ride-?sharing", r"car-?sharing", r"bike-?sharing", r"dial-a-ride",
                                     r"on-demand", r"ride-?pooling", r"carpool", r"dispatch", r"mobility service", r"travel demand", r"parking", r"\bmaas\b", r"공유"]),
    "air":       ("UAM·항공", [r"\buam\b", r"urban air mobility", r"air traffic", r"aircraft", r"aviation", r"drone", r"skyport",
                             r"\buav\b", r"항공"]),
    "core":      ("AI 기초·방법론", [r"neural operator", r"image (recognition|classification)", r"catastrophic forgetting",
                                 r"denoising diffusion", r"representation learning", r"\bimagenet\b", r"universal approximation",
                                 r"partial differential", r"unlearning", r"place recognition"]),
    "agent":     ("LLM 에이전트", [r"\bagents?\b.*\bllm", r"\bllm\b.*\bagents?\b", r"agentic", r"self-evol",
                                r"tool use", r"에이전트"]),
}

METHODS = {
    "llm":       ("LLM·VLM", [r"large language model", r"\bllms?\b", r"\bgpt", r"language model", r"vision[- ]language", r"\bvlms?\b",
                             r"multimodal", r"foundation model", r"\bbert\b", r"prompt", r"언어 ?모델"]),
    "rl":        ("강화학습", [r"reinforcement learning", r"\brl\b", r"q-learning", r"\bdqn\b", r"\bppo\b", r"\btd3\b", r"\bmarl\b",
                            r"actor-critic", r"policy (gradient|optimi[sz]ation|learning|network)", r"강화 ?학습"]),
    "gnn":       ("그래프 신경망", [r"graph neural", r"\bgnns?\b", r"\bgcn\b", r"graph convolution", r"graph attention", r"graph learning",
                               r"graph representation", r"그래프"]),
    "transformer": ("Transformer·Attention", [r"transformer", r"self-attention", r"attention[- ](mechanism|network|module|based)", r"\bvit\b", r"트랜스포머"]),
    "generative": ("생성모델·Diffusion", [r"diffusion", r"generative", r"\bgan\b", r"\bvae\b", r"autoregressive", r"생성 ?모델"]),
    "physics":   ("Physics-informed·Operator", [r"physics-?informed", r"\bpinns?\b", r"neural operator", r"deeponet", r"deep operator",
                                             r"\bfno\b", r"fourier neural", r"partial differential", r"\bpde"]),
    "opt":       ("최적화·OR", [r"optimi[sz]", r"programming", r"\bmilp\b", r"\bmip\b", r"heuristic", r"column generation",
                              r"branch-and", r"evolutionary", r"genetic algorithm", r"\bmpc\b", r"model predictive", r"최적화"]),
    "stats":     ("통계·계량모형", [r"bayesian", r"regression", r"\blogit\b", r"random parameter", r"statistical", r"econometric",
                                r"survival", r"case-control", r"회귀", r"통계"]),
    "dl":        ("딥러닝 일반", [r"deep learning", r"neural network", r"\blstm\b", r"\bcnn\b", r"\bgru\b", r"machine learning",
                              r"딥러닝", r"신경망", r"머신러닝"]),
    "sim":       ("시뮬레이션", [r"simulation", r"\bsumo\b", r"agent-based", r"simulator", r"carla", r"시뮬레이션"]),
    "data":      ("데이터셋·실측", [r"naturalistic", r"dataset", r"trajectory data", r"drone data", r"\bngsim\b", r"\bhighd\b",
                                r"waymo", r"lidar", r"field (test|data)", r"데이터셋"]),
}

# English labels (UI is bilingual)
EN = {
    "flow": "Traffic flow & state estimation", "forecast": "Traffic forecasting", "signal": "Signal & intersection control",
    "micro": "Lane change & car-following", "human": "Driver behavior & human factors", "walk": "Pedestrians & cycling", "resilience": "Disasters & resilience", "safety": "Traffic safety",
    "ad": "Autonomous driving", "worldmodel": "World models & scenario generation", "cav": "CAV & V2X cooperation",
    "ev": "EV & energy", "transit": "Public transit & rail", "freight": "Freight & delivery",
    "network": "Traffic assignment & networks", "service": "Mobility services & demand", "air": "UAM & aviation",
    "core": "AI foundations", "agent": "LLM agents",
    "llm": "LLM & VLM", "rl": "Reinforcement learning", "gnn": "Graph neural networks",
    "transformer": "Transformer & attention", "generative": "Generative models & diffusion",
    "physics": "Physics-informed & neural operators", "opt": "Optimization & OR", "stats": "Statistics & econometrics",
    "dl": "Deep learning (general)", "sim": "Simulation", "data": "Datasets & field data",
}
