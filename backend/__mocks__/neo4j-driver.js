const mockRun = jest.fn().mockResolvedValue({ records: [] });
const mockExecuteWrite = jest.fn(callback => callback({ run: mockRun }));
const mockSession = jest.fn(() => ({
  executeWrite: mockExecuteWrite,
  run: mockRun,
  close: jest.fn().mockResolvedValue(undefined),
}));

const mockDriver = {
  session: mockSession,
  verifyConnectivity: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
};

const driver = jest.fn(() => mockDriver);
const auth = {
  basic: jest.fn(),
};

module.exports = {
  driver,
  auth,
  _mockDriver: mockDriver,
  _mockSession: mockSession,
  _mockExecuteWrite: mockExecuteWrite,
  _mockRun: mockRun,
};