import { RoleEnum } from '../enum/role.enum';
import { Entry } from './database_record.model';

export interface ItemsResponse {
    items: Array<Entry<ItemModel>>;
}

export interface BatchItemsRequest {
    items: Array<Entry<ItemModel>>;
}

export interface ItemModel {
    name: string;
    description: string;
    federatedId: string;
    roles: Array<RoleEnum>;
}

export class Item implements ItemModel {
    public static defaultName: string = 'Generic item name';
    public static defaultDescription: string = 'Generic item description';

    public name: string;
    public description: string;
    public federatedId: string;
    public roles: Array<RoleEnum>;

    public constructor(data: ItemModel) {
        this.name = data.name;
        this.description = data.description;
        this.federatedId = data.federatedId;
        this.roles = data.roles;
    }

    public compare(comparator: ItemModel) {
        return this.name === comparator.name && this.description === comparator.description;
    }
}
