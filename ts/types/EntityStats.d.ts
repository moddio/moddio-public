declare interface EntityStats {
	height: number;
	width: number;
	clientId: string;
	controlledBy: string;
	ownerId: string;
	selectedUnitId: string | number | object;
	userId: string;
	defaultData: any;
	isMobile: boolean;
	rotation?: { x: number; y: number; z: number };
	slotIndex?: number;
	name: string;
	depth: number;
	nameLabelColor?: string;
	material?: {
		metalness: number | string;
		emissive: string;
		roughness: number | string;
		emissiveIntensity: number | string;
		color: string;
	};
	scaleLabelByDistance?: {
		min: number;
		max: number;
		maxDistance: number;
	};
	bodies: Record<
		string,
		{
			fixedRotation: boolean;
			name: string | number | boolean | object | any[];
			mountTarget: any;
			width: number;
			height: number;
			depth: number;
			mountOffset?: { x: number; y: number; z: number };
			mountRotation?: { x: number; y: number; z: number };
		}
	>;
	mountOffsets?: Record<
		string,
		{ position?: { x: number; y: number; z: number }; rotation?: { x: number; y: number; z: number } }
	>;
	currentBody: {
		jointType: string;
		width: number;
		height: number;
		depth: number;
	};
	cellSheet: {
		columnCount: number;
		rowCount: number;
		url: string;
	};
	stateId: string;
	states: Record<
		string,
		{
			body: any;
			animation: string;
		}
	>;
	animations: Record<
		string,
		{
			duration: number;
			forceCompleteAnimation: boolean;
			frames: number[];
			framesPerSecond: number;
			loopCount: number;
			name: string;
			threeAnimationKey: string;
		}
	>;
	default?: {
		id: string;
		x: number;
		y: number;
		z?: number;
		width: number;
		height: number;
		depth?: number;
		inside?: string;
		alpha?: number;
	};
	type: string;
	id: string;
	itemTypeId?: string;
	flip: FlipMode;
	instancedMesh: boolean | undefined;
	controls: {
		mouseBehaviour: any;
		abilities: Record<string, ControlAbility>;
		unitAbilities: Record<string, UnitAbility>;
	};
	ownerUnitId: string;
	cameraPointerLock?: boolean;
	cameraPitchRange?: { min: number; max: number };
	cameraOffset?: { x: number; y: number; z: number };
	is3DObject?: boolean;
	shadow?: boolean;
}
