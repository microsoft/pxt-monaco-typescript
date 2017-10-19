/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import ts = require('../lib/typescriptServices');
import { contents as libdts } from '../lib/lib-ts';
import { contents as libes6ts } from '../lib/lib-es6-ts';

import Promise = monaco.Promise;
import IWorkerContext = monaco.worker.IWorkerContext;

const DEFAULT_LIB = {
	NAME: 'defaultLib:lib.d.ts',
	CONTENTS: libdts
};

const ES6_LIB = {
	NAME: 'defaultLib:lib.es6.d.ts',
	CONTENTS: libes6ts
};

const ignoredCompletions: {[index: string]: string} = {
	// Boxed types
	"Boolean": ts.ScriptElementKind.interfaceElement,
	"Number": ts.ScriptElementKind.interfaceElement,
	"String": ts.ScriptElementKind.interfaceElement,
	"Function": ts.ScriptElementKind.interfaceElement,
	"Object": ts.ScriptElementKind.interfaceElement,

	// Unsupported types
	"RegExp": ts.ScriptElementKind.interfaceElement,
	"IArguments": ts.ScriptElementKind.interfaceElement,

	// C++ types
	"int16": ts.ScriptElementKind.typeElement,
	"int32": ts.ScriptElementKind.typeElement,
	"int8": ts.ScriptElementKind.typeElement,
	"uint16": ts.ScriptElementKind.typeElement,
	"uint32": ts.ScriptElementKind.typeElement,
	"uint8": ts.ScriptElementKind.typeElement,

	// Unsupported keywords
	"instanceof": ts.ScriptElementKind.keyword,
	"typeof": ts.ScriptElementKind.keyword,
	"never": ts.ScriptElementKind.keyword,
	"debugger": ts.ScriptElementKind.keyword,
	"declare": ts.ScriptElementKind.keyword,
	"export": ts.ScriptElementKind.keyword,
	"global": ts.ScriptElementKind.keyword,
	"keyof": ts.ScriptElementKind.keyword,
	"module": ts.ScriptElementKind.keyword,
	"var": ts.ScriptElementKind.keyword,
	"in": ts.ScriptElementKind.keyword,
	"from": ts.ScriptElementKind.keyword,
	"import": ts.ScriptElementKind.keyword,
	"delete": ts.ScriptElementKind.keyword,
	"with": ts.ScriptElementKind.keyword,
	"await": ts.ScriptElementKind.keyword,
	"try": ts.ScriptElementKind.keyword,
	"catch": ts.ScriptElementKind.keyword,
	"finally": ts.ScriptElementKind.keyword,
	"yield": ts.ScriptElementKind.keyword,
	"as": ts.ScriptElementKind.keyword,
	"async": ts.ScriptElementKind.keyword,
	"abstract": ts.ScriptElementKind.keyword,
	"any": ts.ScriptElementKind.keyword,
	"undefined": ts.ScriptElementKind.keyword,
	"throw": ts.ScriptElementKind.keyword,
	"symbol": ts.ScriptElementKind.keyword,
	"super": ts.ScriptElementKind.keyword,
	"require": ts.ScriptElementKind.keyword,
	"readonly": ts.ScriptElementKind.keyword,

	// Internal namespace
	"helpers": ts.ScriptElementKind.moduleElement
}

export class TypeScriptWorker implements ts.LanguageServiceHost {

	// --- model sync -----------------------

	private _ctx: IWorkerContext;
	private _extraLibs: { [fileName: string]: string } = Object.create(null);
	private _languageService = ts.createLanguageService(this);
	private _compilerOptions: ts.CompilerOptions;

	constructor(ctx: IWorkerContext, createData: ICreateData) {
		this._ctx = ctx;
		this._compilerOptions = createData.compilerOptions;
		this._extraLibs = createData.extraLibs;
	}

	// --- language service host ---------------

	getCompilationSettings(): ts.CompilerOptions {
		return this._compilerOptions;
	}

	getScriptFileNames(): string[] {
		let models = this._ctx.getMirrorModels().map(model => model.uri.toString());
		return models.concat(Object.keys(this._extraLibs));
	}

	private _getModel(fileName: string): monaco.worker.IMirrorModel {
		let models = this._ctx.getMirrorModels();
		for (let i = 0; i < models.length; i++) {
			if (models[i].uri.toString() === fileName) {
				return models[i];
			}
		}
		return null;
	}

	getScriptVersion(fileName: string): string {
		let model = this._getModel(fileName);
		if (model) {
			return model.version.toString();
		} else if (this.isDefaultLibFileName(fileName) || fileName in this._extraLibs) {
			// extra lib and default lib are static
			return '1';
		}
	}

	getScriptSnapshot(fileName: string): ts.IScriptSnapshot {
		let text: string;
		let model = this._getModel(fileName);
		if (model) {
			// a true editor model
			text = model.getValue();

		} else if (fileName in this._extraLibs) {
			// static extra lib
			text = this._extraLibs[fileName];

		} else if (fileName === DEFAULT_LIB.NAME) {
			text = DEFAULT_LIB.CONTENTS;
		} else if (fileName === ES6_LIB.NAME) {
			text = ES6_LIB.CONTENTS;
		} else {
			return;
		}

		return <ts.IScriptSnapshot>{
			getText: (start, end) => text.substring(start, end),
			getLength: () => text.length,
			getChangeRange: () => undefined
		};
	}

	getScriptKind?(fileName: string): ts.ScriptKind {
		const suffix = fileName.substr(fileName.lastIndexOf('.') + 1);
		switch (suffix) {
			case 'ts': return ts.ScriptKind.TS;
			case 'tsx': return ts.ScriptKind.TSX;
			case 'js': return ts.ScriptKind.JS;
			case 'jsx': return ts.ScriptKind.JSX;
			default: return this.getCompilationSettings().allowJs
				? ts.ScriptKind.JS
				: ts.ScriptKind.TS;
		}
	}

	getCurrentDirectory(): string {
		return '';
	}

	getDefaultLibFileName(options: ts.CompilerOptions): string {
		// TODO@joh support lib.es7.d.ts
		return options.target <= ts.ScriptTarget.ES5 ? DEFAULT_LIB.NAME : ES6_LIB.NAME;
	}

	isDefaultLibFileName(fileName: string): boolean {
		return fileName === this.getDefaultLibFileName(this._compilerOptions);
	}

	// --- language features

	getSyntacticDiagnostics(fileName: string): Promise<ts.Diagnostic[]> {
		const diagnostics = this._languageService.getSyntacticDiagnostics(fileName);
		diagnostics.forEach(diag => diag.file = undefined); // diag.file cannot be JSON'yfied
		return Promise.as(diagnostics);
	}

	getSemanticDiagnostics(fileName: string): Promise<ts.Diagnostic[]> {
		const diagnostics = this._languageService.getSemanticDiagnostics(fileName);
		diagnostics.forEach(diag => diag.file = undefined); // diag.file cannot be JSON'yfied
		return Promise.as(diagnostics);
	}

	getCompilerOptionsDiagnostics(fileName: string): Promise<ts.Diagnostic[]> {
		const diagnostics = this._languageService.getCompilerOptionsDiagnostics();
		diagnostics.forEach(diag => diag.file = undefined); // diag.file cannot be JSON'yfied
		return Promise.as(diagnostics);
	}

	getCompletionsAtPosition(fileName: string, position: number): Promise<ts.CompletionInfo> {
		const completions = this._languageService.getCompletionsAtPosition(fileName, position);
		if (completions && completions.entries)
			completions.entries = completions.entries
				.filter(e => ignoredCompletions[e.name] !== e.kind
						&& e.name.indexOf('_') != 0)
		return Promise.as(completions);
	}

	getCompletionEntryDetails(fileName: string, position: number, entry: string): Promise<ts.CompletionEntryDetails> {
		return Promise.as(this._languageService.getCompletionEntryDetails(fileName, position, entry));
	}

	getSignatureHelpItems(fileName: string, position: number): Promise<ts.SignatureHelpItems> {
		return Promise.as(this._languageService.getSignatureHelpItems(fileName, position));
	}

	getQuickInfoAtPosition(fileName: string, position: number): Promise<ts.QuickInfo> {
		return Promise.as(this._languageService.getQuickInfoAtPosition(fileName, position));
	}

	getOccurrencesAtPosition(fileName: string, position: number): Promise<ts.ReferenceEntry[]> {
		return Promise.as(this._languageService.getOccurrencesAtPosition(fileName, position));
	}

	getDefinitionAtPosition(fileName: string, position: number): Promise<ts.DefinitionInfo[]> {
		return Promise.as(this._languageService.getDefinitionAtPosition(fileName, position));
	}

	getReferencesAtPosition(fileName: string, position: number): Promise<ts.ReferenceEntry[]> {
		return Promise.as(this._languageService.getReferencesAtPosition(fileName, position));
	}

	getNavigationBarItems(fileName: string): Promise<ts.NavigationBarItem[]> {
		return Promise.as(this._languageService.getNavigationBarItems(fileName));
	}

	getNavigateToItems(searchValue: string, maxResultCount?: number): Promise<ts.NavigateToItem[]> {
		return Promise.as(this._languageService.getNavigateToItems(searchValue, maxResultCount));
	}

	getFormattingEditsForDocument(fileName: string, options: ts.FormatCodeOptions): Promise<ts.TextChange[]> {
		return Promise.as(this._languageService.getFormattingEditsForDocument(fileName, options));
	}

	getFormattingEditsForRange(fileName: string, start: number, end: number, options: ts.FormatCodeOptions): Promise<ts.TextChange[]> {
		return Promise.as(this._languageService.getFormattingEditsForRange(fileName, start, end, options));
	}

	getFormattingEditsAfterKeystroke(fileName: string, postion: number, ch: string, options: ts.FormatCodeOptions): Promise<ts.TextChange[]> {
		return Promise.as(this._languageService.getFormattingEditsAfterKeystroke(fileName, postion, ch, options));
	}

	getEmitOutput(fileName: string): Promise<ts.EmitOutput> {
		return Promise.as(this._languageService.getEmitOutput(fileName));
	}

	getLeadingComments(fileName: string, position: number, entry: string): Promise<string> {
		let typeChecker = this._languageService.getProgram().getTypeChecker();
		let sourceFile = this._languageService.getProgram().getSourceFile(fileName);

		let node = (ts as any).getTokenAtPosition(sourceFile, position);

		let doc = ts.getLeadingCommentRanges(sourceFile.text, node.getFullStart());
		let cmt = '';
		if (doc) {
			cmt = doc.map(r => sourceFile.text.slice(r.pos, r.end)).join("\n");
		}
		return Promise.as(cmt);
	}

	getCompletionEntryDetailsAndSnippet(fileName: string, position: number, entry: string, label: string, parent?: string): Promise<[ts.CompletionEntryDetails, string]> {
		let typeChecker = this._languageService.getProgram().getTypeChecker();
		let sourceFile = this._languageService.getProgram().getSourceFile(fileName);
		let symbol = this._languageService.getCompletionEntrySymbol(fileName, position, entry);

		if (!symbol) {
			if (parent) {
				symbol = this._languageService.getCompletionEntrySymbol(fileName, position, parent);
				symbol = symbol ? symbol.members[entry] : undefined;
			}

			if (!symbol) {
				return;
			}
		}

		const { displayParts, documentation, symbolKind } = (ts as any).SymbolDisplay.getSymbolDisplayPartsDocumentationAndSymbolKind(typeChecker, symbol, sourceFile, location, location, (ts as any).SemanticMeaning.All);
		let entryDetails: ts.CompletionEntryDetails = {
			name: entry,
			kindModifiers: (ts as any).SymbolDisplay.getSymbolModifiers(symbol),
			kind: symbolKind,
			displayParts,
			documentation,
			tags: undefined
		};

		let codeSnippet = label;

		if (symbol && symbol.valueDeclaration && symbol.valueDeclaration.kind) {
			let type = typeChecker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration);
			let signatures = type.getCallSignatures();

			const defaultImgLit = `
	. . . . .
	. . . . .
	. . # . .
	. . . . .
	. . . . .
	`
			let renderDefaultVal = function (name: string, type: string): string {
				switch (type) {
					case "number": return "0";
					case "boolean": return "false";
					case "string": return (name == "leds" ? "`" + defaultImgLit + "`" : "\"\"");
				}
				return `\${1:${name}}`;
			}

			let renderParameter = function (signature: ts.Signature, parameter: ts.Symbol): string {
				let parameterType = typeChecker.getTypeOfSymbolAtLocation(parameter, parameter.valueDeclaration);
				let documentationComment = parameter.getDocumentationComment();
				// Get parameter defaults from JsDoc:
				let parameterDoc = ts.displayPartsToString(documentationComment);
				let paramExamples = /\beg\.?:\s*(.+)/i.exec(parameterDoc);
				if (paramExamples) {
					let reg: RegExp = /(?:"([^"]*)")|(?:'([^']*)')|(?:([^\s,]+))/g;
					let match = reg.exec(paramExamples[1].trim());
					if (match) {
						if (match[1] || match[2]) {
							const val = match[1] || match[2];
							return `"${val}"`;
						}
						return match[3];
					}
				}
				if (parameterType && parameterType.flags) {
					let flags = parameterType.flags;
					if (flags & ts.TypeFlags.EnumLiteral) {
						// Enum, go through the enum's declarations to find it's first value
						const enumParameter = <ts.EnumType>parameterType;
						let enumValue: string = undefined;
						if (enumParameter && enumParameter.symbol) {
							const enumDeclarations = enumParameter.symbol.getDeclarations();
							let enumDeclaration: ts.EnumDeclaration;
							for (let i = 0; i < enumDeclarations.length; i++) {
								const declaration = enumDeclarations[i];
								if (declaration.kind == ts.SyntaxKind.EnumDeclaration) {
									enumDeclaration = declaration as ts.EnumDeclaration;
									break;
								}
							}
							if (enumDeclaration && enumDeclaration.members && enumDeclaration.members.length > 0) {
								const enumName = enumDeclaration.members[0].name;
								if (enumName.kind == ts.SyntaxKind.Identifier) {
									enumValue = (enumName as ts.Identifier).text;
								}
							}
						}
						if (enumValue)
							return `${parameterType.symbol.name}.${enumValue}`;
					} else if (flags & ts.TypeFlags.Object) {
						let objectFlags = (parameterType as ts.ObjectType).objectFlags;
						if (objectFlags & ts.ObjectFlags.Anonymous) {
							// Anonymous Function
							let functionArgument = "()";
							let returnValue = "$0";
							let functionSignature = parameterType.getCallSignatures();
							if (functionSignature && functionSignature.length > 0) {
								let displayParts = (ts as any).mapToDisplayParts((writer: ts.DisplayPartsSymbolWriter) => {
									typeChecker.getSymbolDisplayBuilder().buildSignatureDisplay(functionSignature[0], writer);
								});
								let returnType = typeChecker.getReturnTypeOfSignature(functionSignature[0]);
								if (returnType.flags & ts.TypeFlags.NumberLike)
									returnValue = "return 0;$0";
								else if (returnType.flags & ts.TypeFlags.StringLike)
									returnValue = "return \"\";$0";
								else if (returnType.flags & ts.TypeFlags.BooleanLike)
									returnValue = "return false;$0";
								let displayPartsStr = ts.displayPartsToString(displayParts);
								functionArgument = displayPartsStr.substr(0, displayPartsStr.lastIndexOf(":"));
							}
							return `function ${functionArgument} {\n\t${returnValue}\n}`
						} else {
							const typeString = typeChecker.typeToString(parameterType);
							const bracketIndex = typeString.indexOf("[]");
							if (flags & ts.ObjectFlags.Tuple || (bracketIndex !== -1 && bracketIndex === typeString.length - 2)) {
								return `[]`;
							}
						}
					} else if (flags & ts.TypeFlags.String
						|| flags & ts.TypeFlags.Number
						|| flags & ts.TypeFlags.Boolean
						|| flags & ts.TypeFlags.Void) {
						// Primitive type
						return renderDefaultVal(parameter.name, (parameterType as any).intrinsicName);
					}
				}
				return `\${1:${parameter.name}}`;
			}
			if (signatures && signatures.length > 0) {
				let signature = signatures[0];
				let minArgumentCount = (signature as any).minArgumentCount;
				let suggestionArgumentNames: string[] = [];
				signature.parameters.slice(0, minArgumentCount).forEach(parameter => {
					suggestionArgumentNames.push(renderParameter(signature, parameter));
				})

				if (suggestionArgumentNames.length > 0) {
					codeSnippet += '(' + suggestionArgumentNames.join(', ') + ')';
				} else {
					codeSnippet += '()';
				}
			}
		}
		return Promise.as([entryDetails, codeSnippet] as [ts.CompletionEntryDetails, string]);
	}

}

export interface ICreateData {
	compilerOptions: ts.CompilerOptions;
	extraLibs: { [path: string]: string };
}

export function create(ctx: IWorkerContext, createData: ICreateData): TypeScriptWorker {
	return new TypeScriptWorker(ctx, createData);
}
