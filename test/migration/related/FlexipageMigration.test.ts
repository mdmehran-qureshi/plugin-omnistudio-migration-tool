import * as path from 'path';
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { expect } from '@salesforce/command/lib/test';
import { Messages, Org } from '@salesforce/core';
import sinon = require('sinon');
import { FlexipageMigration } from '../../../src/migration/related/FlexipageMigration';
import { Constants } from '../../../src/utils/constants/stringContants';
import { Flexipage } from '../../../src/migration/interfaces';

interface MockSfProject {
  retrieve: sinon.SinonStub;
}

interface MockLogger {
  info: sinon.SinonStub;
  logVerbose: sinon.SinonStub;
  error: sinon.SinonStub;
  log: sinon.SinonStub;
}

interface MockXmlUtil {
  parse: sinon.SinonStub;
  build: sinon.SinonStub;
}

interface MockFileDiffUtil {
  getFileDiff: sinon.SinonStub;
  getXMLDiff: sinon.SinonStub;
}

interface MockTransformFlexipageBundle extends sinon.SinonStub {
  (bundle: Flexipage, namespace: string): Flexipage | boolean;
}

interface MockFs {
  readdirSync: sinon.SinonStub;
  readFileSync: sinon.SinonStub;
  writeFileSync: sinon.SinonStub;
}

interface MockPath {
  join: sinon.SinonStub;
}

interface MockShell {
  cd: sinon.SinonStub;
}

interface MockCreateProgressBar {
  start: sinon.SinonStub;
  increment: sinon.SinonStub;
  stop: sinon.SinonStub;
}

describe('FlexipageMigration', () => {
  let flexipageMigration: FlexipageMigration;
  let sandbox: sinon.SinonSandbox;
  let mockOrg: Org;
  let mockMessages: Messages;
  let mockSfProject: MockSfProject;
  let mockLogger: MockLogger;
  let mockXmlUtil: MockXmlUtil;
  let mockFileDiffUtil: MockFileDiffUtil;
  let mockTransformFlexipageBundle: MockTransformFlexipageBundle;

  const testProjectPath = '/test/project/path';
  const testNamespace = 'testNamespace';

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Mock Org
    mockOrg = {
      getUsername: sandbox.stub().returns('test@org.com'),
    } as unknown as Org;

    // Mock Messages
    mockMessages = {
      getMessage: sandbox.stub().returns('Mock message'),
    } as unknown as Messages;

    // Mock sfProject
    mockSfProject = {
      retrieve: sandbox.stub().resolves(),
    };

    // Mock Logger
    mockLogger = {
      info: sandbox.stub(),
      logVerbose: sandbox.stub(),
      error: sandbox.stub(),
      log: sandbox.stub(),
    };

    // Mock xmlUtil
    mockXmlUtil = {
      parse: sandbox.stub(),
      build: sandbox.stub(),
    };

    // Mock FileDiffUtil
    mockFileDiffUtil = {
      getFileDiff: sandbox.stub().returns('mock-diff'),
      getXMLDiff: sandbox.stub().returns('mock-diff'),
    };

    // Mock transformFlexipageBundle
    mockTransformFlexipageBundle = sandbox.stub();

    // Stub dependencies
    sandbox.stub(require('../../../src/utils/sfcli/project/sfProject'), 'sfProject').value(mockSfProject);
    sandbox.stub(require('../../../src/utils/logger'), 'Logger').value(mockLogger);

    // Mock XMLUtil class constructor and methods
    const MockXMLUtil = function () {
      return mockXmlUtil;
    };
    MockXMLUtil.prototype = mockXmlUtil;
    sandbox.stub(require('../../../src/utils/XMLUtil'), 'XMLUtil').value(MockXMLUtil);

    sandbox
      .stub(require('../../../src/utils/flexipage/flexiPageTransformer'), 'transformFlexipageBundle')
      .value(mockTransformFlexipageBundle);

    // Mock FileDiffUtil constructor
    const MockFileDiffUtil = function () {
      return mockFileDiffUtil;
    };
    sandbox
      .stub(require('../../../src/utils/lwcparser/fileutils/FileDiffUtil'), 'FileDiffUtil')
      .value(MockFileDiffUtil);

    flexipageMigration = new FlexipageMigration(testProjectPath, testNamespace, mockOrg, mockMessages);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('processObjectType', () => {
    it('should return FlexiPage constant', () => {
      const result = flexipageMigration.processObjectType();
      expect(result).to.equal(Constants.FlexiPage);
    });
  });

  describe('assess', () => {
    it('should call process with assess mode', () => {
      const processStub = sandbox.stub(flexipageMigration as any, 'process').returns([]);

      flexipageMigration.assess();

      expect(processStub.calledOnceWith('assess')).to.be.true;
      expect(mockLogger.log.calledWith('Mock message')).to.be.true;
    });
  });

  describe('migrate', () => {
    it('should call process with migrate mode', () => {
      const processStub = sandbox.stub(flexipageMigration as any, 'process').returns([]);

      flexipageMigration.migrate();

      expect(processStub.calledOnceWith('migrate')).to.be.true;
      expect(mockLogger.log.calledWith('Mock message')).to.be.true;
    });
  });

  describe('process', () => {
    let mockFs: MockFs;
    let mockPath: MockPath;
    let mockShell: MockShell;
    let mockCreateProgressBar: MockCreateProgressBar;

    beforeEach(() => {
      mockFs = {
        readdirSync: sandbox.stub(),
        readFileSync: sandbox.stub(),
        writeFileSync: sandbox.stub(),
      };

      mockPath = {
        join: sandbox.stub(),
      };

      mockShell = {
        cd: sandbox.stub(),
      };

      mockCreateProgressBar = {
        start: sandbox.stub(),
        increment: sandbox.stub(),
        stop: sandbox.stub(),
      };

      // Stub the modules
      sandbox.stub(require('fs'), 'readdirSync').value(mockFs.readdirSync);
      sandbox.stub(require('fs'), 'readFileSync').value(mockFs.readFileSync);
      sandbox.stub(require('fs'), 'writeFileSync').value(mockFs.writeFileSync);
      sandbox.stub(require('path'), 'join').value(mockPath.join);
      sandbox.stub(require('shelljs'), 'cd').value(mockShell.cd);
      sandbox
        .stub(require('../../../src/migration/base'), 'createProgressBar')
        .value(sandbox.stub().returns(mockCreateProgressBar));
    });

    it('should process flexipages successfully in assess mode', () => {
      // Arrange
      const testFiles = ['test1.xml', 'test2.xml'];
      const testFilePath = '/test/path/file.xml';
      const testContent = '<FlexiPage>test content</FlexiPage>';

      mockFs.readdirSync.returns(testFiles);
      mockPath.join.returns(testFilePath);
      mockFs.readFileSync.returns(testContent);
      mockXmlUtil.parse.returns({ FlexiPage: { test: 'data', flexiPageRegions: [] } });
      mockTransformFlexipageBundle.returns({ transformed: 'data', flexiPageRegions: [] });
      mockXmlUtil.build.returns('<FlexiPage>transformed</FlexiPage>');

      sandbox.stub(flexipageMigration as any, 'processFlexiPage').returns({
        name: 'test.xml',
        errors: [],
        path: testFilePath,
        diff: 'mock-diff',
        status: 'Can be Automated',
      });

      // Act
      const result = (flexipageMigration as any).process('assess');

      // Assert
      expect(mockFs.readdirSync.calledWith(path.join(testProjectPath, 'force-app', 'main', 'default', 'flexipages'))).to
        .be.true;
      expect(result).to.be.an('array').with.length(2);
    });

    it('should handle errors during file processing', () => {
      // Arrange
      const testFiles = ['test1.xml'];
      const testFilePath = '/test/path/file.xml';

      mockFs.readdirSync.returns(testFiles);
      mockPath.join.returns(testFilePath);

      sandbox.stub(flexipageMigration as any, 'processFlexiPage').throws(new Error('Processing error'));

      // Act
      const result = (flexipageMigration as any).process('assess');

      // Assert
      expect(result).to.be.an('array').with.length(1);
      expect(result[0]).to.deep.include({
        name: 'test1.xml',
        errors: ['Processing error'],
        path: testFilePath,
        diff: '',
        status: 'Failed',
      });
      expect(mockLogger.error.called).to.be.true;
    });

    it('should process flexipages in migrate mode and write files', () => {
      // Arrange
      const testFiles = ['test1.xml'];
      const testFilePath = '/test/path/file.xml';
      const testContent = '<FlexiPage>test content</FlexiPage>';

      mockFs.readdirSync.returns(testFiles);
      mockPath.join.returns(testFilePath);
      mockFs.readFileSync.returns(testContent);
      mockXmlUtil.parse.returns({ FlexiPage: { test: 'data', flexiPageRegions: [] } });
      mockTransformFlexipageBundle.returns({ transformed: 'data', flexiPageRegions: [] });
      mockXmlUtil.build.returns('<FlexiPage>transformed</FlexiPage>');

      sandbox.stub(flexipageMigration as any, 'processFlexiPage').returns({
        name: 'test.xml',
        errors: [],
        path: testFilePath,
        diff: 'mock-diff',
        status: 'Ready for migration',
      });

      // Act
      const result = (flexipageMigration as any).process('migrate');

      // Assert
      expect(result).to.be.an('array').with.length(1);
    });
  });

  describe('processFlexiPage', () => {
    let mockFs: MockFs;

    beforeEach(() => {
      mockFs = {
        readdirSync: sandbox.stub(),
        readFileSync: sandbox.stub(),
        writeFileSync: sandbox.stub(),
      };

      sandbox.stub(require('fs'), 'readFileSync').value(mockFs.readFileSync);
      sandbox.stub(require('fs'), 'writeFileSync').value(mockFs.writeFileSync);
    });

    it('should process flexipage successfully in assess mode', () => {
      // Arrange
      const fileName = 'test.xml';
      const filePath = '/test/path/test.xml';
      const fileContent = '<FlexiPage>test content</FlexiPage>';

      mockFs.readFileSync.returns(fileContent);
      mockXmlUtil.parse.returns({ FlexiPage: { test: 'data', flexiPageRegions: [] } });
      mockTransformFlexipageBundle.returns({ transformed: 'data', flexiPageRegions: [] });
      mockXmlUtil.build.returns('<FlexiPage>transformed</FlexiPage>');

      // Act
      const result = (flexipageMigration as any).processFlexiPage(fileName, filePath, 'assess');

      // Assert
      expect(result).to.deep.include({
        path: filePath,
        name: fileName,
        diff: JSON.stringify('mock-diff'),
        errors: [],
        status: 'Ready for migration',
      });
    });

    it('should process flexipage successfully in migrate mode and write file', () => {
      // Arrange
      const fileName = 'test.xml';
      const filePath = '/test/path/test.xml';
      const fileContent = '<FlexiPage>test content</FlexiPage>';
      const mockFlexipage: Flexipage = { test: 'data', flexiPageRegions: [] };
      const transformedFlexipage: Flexipage = { transformed: 'data', flexiPageRegions: [] };
      const modifiedContent = '<FlexiPage>transformed</FlexiPage>';

      mockFs.readFileSync.returns(fileContent);
      mockXmlUtil.parse.returns({ FlexiPage: mockFlexipage });
      mockTransformFlexipageBundle.returns(transformedFlexipage);
      mockXmlUtil.build.returns(modifiedContent);

      // Act
      const result = (flexipageMigration as any).processFlexiPage(fileName, filePath, 'migrate');

      // Assert
      expect(mockFs.writeFileSync.calledWith(filePath, modifiedContent)).to.be.true;
      expect(result).to.deep.include({
        path: filePath,
        name: fileName,
        diff: JSON.stringify('mock-diff'),
        errors: [],
        status: 'Successfully migrated',
      });
    });

    it('should return No Changes status when transformFlexipageBundle returns false', () => {
      // Arrange
      const fileName = 'test.xml';
      const filePath = '/test/path/test.xml';
      const fileContent = '<FlexiPage>test content</FlexiPage>';
      const mockFlexipage: Flexipage = { test: 'data', flexiPageRegions: [] };

      mockFs.readFileSync.returns(fileContent);
      mockXmlUtil.parse.returns({ FlexiPage: mockFlexipage });
      mockTransformFlexipageBundle.returns(false);

      // Act
      const result = (flexipageMigration as any).processFlexiPage(fileName, filePath, 'assess');

      // Assert
      expect(result).to.be.null;
    });

    it('should handle errors during processing', () => {
      // Arrange
      const fileName = 'test.xml';
      const filePath = '/test/path/test.xml';
      const fileContent = '<FlexiPage>test content</FlexiPage>';

      mockFs.readFileSync.returns(fileContent);
      mockXmlUtil.parse.throws(new Error('Parse error'));

      // Act & Assert
      expect(() => (flexipageMigration as any).processFlexiPage(fileName, filePath, 'assess')).to.throw('Parse error');
    });
  });

  describe('error handling', () => {
    it('should handle file system errors gracefully', () => {
      // Arrange
      const mockFs = {
        readdirSync: sandbox.stub().throws(new Error('File system error')),
      };
      sandbox.stub(require('fs'), 'readdirSync').value(mockFs.readdirSync);

      // Act & Assert
      expect(() => (flexipageMigration as any).process('assess')).to.throw('File system error');
    });
  });
});
