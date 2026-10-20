// expo-file-system : seul `File` est utilisé (envoi de photos). Le choix d'une photo n'est pas disponible dans la capture.
export class File extends Blob { constructor(uri) { super([]); this.uri = uri; } }
export class Directory { constructor(uri) { this.uri = uri; } }
export const Paths = { cache: "", document: "" };
