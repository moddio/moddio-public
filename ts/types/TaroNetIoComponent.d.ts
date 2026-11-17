type UiUpdateData = {
	command?: string;
	text?: string;
	type?: string;
	extraData?: any;
	participationCost?: any;
};

declare class TaroNetIoComponent extends TaroEventingClass implements TaroNetIoClient {
	id(): string;

	stream: TaroStreamComponent;

	disconnect<T>(clientId: string, reason: string, reasonCode: string): void;

	send<T extends keyof MapEditTool = any>(commandName: string, data: TileData<T> | EditEntityData | ScriptChangesData | boolean | UiUpdateData, clientId?: string): void;
}
