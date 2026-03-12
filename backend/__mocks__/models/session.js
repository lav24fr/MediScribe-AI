const mockQueryInstance = {
  populate: jest.fn().mockReturnThis(), 
  exec: jest.fn(), 
  mockResolvedValue: jest.fn(function(value) {
    this.exec.mockResolvedValue(value);
    return this;
  }),
};

const Session = {
  findById: jest.fn(function() {
    return mockQueryInstance;
  }),
};

Session.clearMocks = () => {
  Session.findById.mockClear();
  mockQueryInstance.populate.mockClear();
  mockQueryInstance.exec.mockClear();
  mockQueryInstance.mockResolvedValue.mockClear();
};

module.exports = {
    Session,
    mockQueryInstance
};