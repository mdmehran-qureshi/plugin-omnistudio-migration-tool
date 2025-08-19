/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { expect } from '@salesforce/command/lib/test';
import { Org } from '@salesforce/core';
import sinon = require('sinon');
import { ApexMigration } from '../../../src/migration/related/ApexMigration';
import { InterfaceImplements } from '../../../src/utils/apex/parser/apexparser';

interface MockFileUtil {
  readFilesSync: sinon.SinonStub;
}

interface MockFs {
  readFileSync: sinon.SinonStub;
  writeFileSync: sinon.SinonStub;
}

interface MockShell {
  pwd: sinon.SinonStub;
  cd: sinon.SinonStub;
}

interface MockCreateProgressBar {
  start: sinon.SinonStub;
  update: sinon.SinonStub;
  stop: sinon.SinonStub;
}

interface MockLogger {
  info: sinon.SinonStub;
  logVerbose: sinon.SinonStub;
  error: sinon.SinonStub;
  log: sinon.SinonStub;
}

describe('ApexMigration', () => {
  let apexMigration: ApexMigration;
  let sandbox: sinon.SinonSandbox;
  let mockOrg: Org;
  let mockFileUtil: MockFileUtil;
  let mockFs: MockFs;
  let mockShell: MockShell;
  let mockCreateProgressBar: MockCreateProgressBar;
  let mockLogger: MockLogger;

  const testProjectPath = '/test/project/path';
  const testNamespace = 'testNamespace';
  const testTargetNamespace = 'targetNamespace';

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Mock Org
    mockOrg = {
      getUsername: sandbox.stub().returns('test@org.com'),
    } as unknown as Org;

    // Mock FileUtil
    mockFileUtil = {
      readFilesSync: sandbox.stub(),
    };

    // Mock fs
    mockFs = {
      readFileSync: sandbox.stub(),
      writeFileSync: sandbox.stub(),
    };

    // Mock shell
    mockShell = {
      pwd: sandbox.stub().returns('/current/directory'),
      cd: sandbox.stub(),
    };

    // Mock createProgressBar
    mockCreateProgressBar = {
      start: sandbox.stub(),
      update: sandbox.stub(),
      stop: sandbox.stub(),
    };

    // Mock Logger
    mockLogger = {
      info: sandbox.stub(),
      logVerbose: sandbox.stub(),
      error: sandbox.stub(),
      log: sandbox.stub(),
    };

    // Stub dependencies
    sandbox.stub(require('../../../src/utils/file/fileUtil'), 'FileUtil').value(mockFileUtil);
    sandbox.stub(require('fs'), 'readFileSync').value(mockFs.readFileSync);
    sandbox.stub(require('fs'), 'writeFileSync').value(mockFs.writeFileSync);
    sandbox.stub(require('shelljs'), 'pwd').value(mockShell.pwd);
    sandbox.stub(require('shelljs'), 'cd').value(mockShell.cd);
    sandbox
      .stub(require('../../../src/migration/base'), 'createProgressBar')
      .value(sandbox.stub().returns(mockCreateProgressBar));

    // Mock Logger class and its static logger property
    const MockLogger = {
      logger: mockLogger,
      info: mockLogger.info,
      logVerbose: mockLogger.logVerbose,
      error: mockLogger.error,
      log: mockLogger.log,
    };
    sandbox.stub(require('../../../src/utils/logger'), 'Logger').value(MockLogger);

    // Mock ApexASTParser constructor and methods
    const MockApexASTParser = function () {
      return {
        parse: sandbox.stub(),
        rewrite: sandbox.stub(),
        implementsInterfaces: new Map(),
        hasCallMethodImplemented: false,
        classDeclaration: {},
        namespaceChanges: new Map(),
        methodParameters: new Map(),
        nonReplacableMethodParameters: [],
      };
    };
    sandbox.stub(require('../../../src/utils/apex/parser/apexparser'), 'ApexASTParser').value(MockApexASTParser);

    // Mock other dependencies
    sandbox.stub(require('../../../src/utils/lwcparser/fileutils/FileDiffUtil'), 'FileDiffUtil').value(function () {
      return {
        getFileDiff: sandbox.stub().returns('mock-diff'),
      };
    });

    apexMigration = new ApexMigration(testProjectPath, testNamespace, mockOrg, testTargetNamespace);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('replaceAllInterfaces', () => {
    it('should replace multiple interfaces with System.Callable when Callable is already implemented', () => {
      // Arrange
      const mockParser = {
        implementsInterfaces: new Map([
          [new InterfaceImplements('Callable', 'System'), [{ startIndex: 10, stopIndex: 20, text: 'System.Callable' }]],
          [
            new InterfaceImplements('VlocityOpenInterface2', 'testNamespace'),
            [{ startIndex: 5, stopIndex: 15, text: 'testNamespace.VlocityOpenInterface2' }],
          ],
        ]),
        hasCallMethodImplemented: false,
        classDeclaration: {},
      };

      // Act
      const result = (apexMigration as any).replaceAllInterfaces(
        mockParser.implementsInterfaces,
        [],
        mockParser,
        'TestClass.cls'
      );

      // Assert
      expect(result).to.be.an('array').with.length(2);
      expect(result[0].constructor.name).to.equal('RangeTokenUpdate');
      expect(result[1].constructor.name).to.equal('InsertAfterTokenUpdate');
    });

    it('should handle case where leftmost and rightmost tokens are found correctly', () => {
      // Arrange
      const mockParser = {
        implementsInterfaces: new Map([
          [new InterfaceImplements('Interface1', 'ns1'), [{ startIndex: 100, stopIndex: 110, text: 'ns1.Interface1' }]],
          [new InterfaceImplements('Interface2', 'ns2'), [{ startIndex: 50, stopIndex: 60, text: 'ns2.Interface2' }]],
        ]),
        hasCallMethodImplemented: true,
        classDeclaration: {},
      };

      // Act
      const result = (apexMigration as any).replaceAllInterfaces(
        mockParser.implementsInterfaces,
        [],
        mockParser,
        'TestClass.cls'
      );

      // Assert
      expect(result).to.be.an('array').with.length(1);
      expect(result[0].constructor.name).to.equal('RangeTokenUpdate');
    });

    it('should not add call method when it already exists', () => {
      // Arrange
      const mockParser = {
        implementsInterfaces: new Map([
          [new InterfaceImplements('Callable', 'System'), [{ startIndex: 10, stopIndex: 20, text: 'System.Callable' }]],
          [
            new InterfaceImplements('VlocityOpenInterface2', 'testNamespace'),
            [{ startIndex: 5, stopIndex: 15, text: 'testNamespace.VlocityOpenInterface2' }],
          ],
        ]),
        hasCallMethodImplemented: true,
        classDeclaration: {},
      };

      // Act
      const result = (apexMigration as any).replaceAllInterfaces(
        mockParser.implementsInterfaces,
        [],
        mockParser,
        'TestClass.cls'
      );

      // Assert
      expect(result).to.be.an('array').with.length(1);
      expect(result[0].constructor.name).to.equal('RangeTokenUpdate');
    });
  });
});
