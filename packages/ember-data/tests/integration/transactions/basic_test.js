/*global QUnit*/

var get = Ember.get, set = Ember.set;

var Person = DS.Model.extend({
  name: DS.attr('string'),
  foo: DS.attr('string')
});

var transaction, store;

module("Transactions", {
  setup: function() {
    store = DS.Store.create();
  },

  teardown: function() {
    if (transaction) { transaction.destroy(); }
    store.destroy();
  }
});

test("Stores can create a new transaction", function() {
  transaction = store.transaction();

  ok(transaction, "transaction is created");
  ok(DS.Transaction.detectInstance(transaction), "transaction is an instance of DS.Transaction");
});

test("If a record is created from a transaction, it is not committed when store.commit() is called but is committed when transaction.commit() is called", function() {
  var commitCalls = 0;

  set(store, 'adapter', DS.Adapter.create({
    createRecords: function() {
      commitCalls++;
    }
  }));

  transaction = store.transaction();
  transaction.createRecord(Person, {});

  store.commit();
  equal(commitCalls, 0, "commit was not called when committing the store");

  transaction.commit();
  equal(commitCalls, 1, "commit was called when committing the transaction");
});

test("If a record is added to a transaction then updated, it is not committed when store.commit() is called but is committed when transaction.commit() is called", function() {
  var commitCalls = 0;

  set(store, 'adapter', DS.Adapter.create({
    updateRecords: function() {
      commitCalls++;
    }
  }));

  store.load(Person, { id: 1, name: "Yehuda Katz" });

  transaction = store.transaction();
  var record = store.find(Person, 1);
  transaction.add(record);

  record.set('name', 'Brohuda Brokatz');

  store.commit();
  equal(commitCalls, 0, "commit was not called when committing the store");

  transaction.commit();
  equal(commitCalls, 1, "commit was called when committing the transaction");
});

test("a record is removed from a transaction after the records become clean", function() {
  var createCalls = 0, updateCalls = 0;

  var store = DS.Store.create({
    adapter: DS.Adapter.create({
      createRecord: function(store, type, record) {
        createCalls++;

        store.didSaveRecord(record, { id: 1 });
      },

      updateRecords: function() {
        updateCalls++;
      }
    })
  });

  transaction = store.transaction();
  var record = transaction.createRecord(Person, {});

  transaction.commit();
  equal(createCalls, 1, "create should be called when committing the store");

  record.set('foo', 'bar');

  transaction.commit();
  equal(updateCalls, 0, "commit was not called when committing the transaction");

  store.commit();
  equal(updateCalls, 1, "commit was called when committing the store");
});

test("after a record is added to a transaction then deleted, it is not committed when store.commit() is called but is committed when transaction.commit() is called", function() {
  var commitCalls = 0;

  var store = DS.Store.create({
    adapter: DS.Adapter.create({
      deleteRecords: function() {
        commitCalls++;
      }
    })
  });

  store.load(Person, { id: 1, name: "Yehuda Katz" });

  transaction = store.transaction();
  var record = store.find(Person, 1);
  transaction.add(record);

  record.deleteRecord();

  store.commit();
  equal(commitCalls, 0, "commit was not called when committing the store");

  transaction.commit();
  equal(commitCalls, 1, "commit was called when committing the transaction");
});

test("a record that is clean can be removed from a transaction", function() {
  var updateCalled = 0;

  var store = DS.Store.create({
    adapter: DS.Adapter.create({
      updateRecord: function() {
        updateCalled++;
      }
    })
  });

  store.load(Person, { id: 1, name: "Yehuda Katz" });

  transaction = store.transaction();
  var record = store.find(Person, 1);

  transaction.add(record);
  transaction.remove(record);

  set(record, 'name', "shuck it trebek");

  transaction.commit();

  equal(updateCalled, 0, "after removing from transaction it does not commit");

  store.commit();

  equal(updateCalled, 1, "after removing from transaction it commits on the store");
});

test("a record that is in the clean state is moved back to the default transaction after its transaction is committed", function() {
  var store = DS.Store.create();

  store.load(Person, { id: 1 });

  var person = store.find(Person, 1);

  transaction = store.transaction();
  transaction.add(person);
  transaction.commit();

  equal(get(person, 'transaction'), get(store, 'defaultTransaction'), "record should have been moved back to the default transaction");
});

test("modified records are reset when their transaction is rolled back", function() {

  var store = DS.Store.create({
    adapter: DS.Adapter.create({
      commit: function() {
        ok(false, "should never call adapter methods");
      }
    })
  });

  store.load(Person, { id: 1, name: "Scumbag Tom" });
  store.load(Person, { id: 2, name: "Scumbag Carl" });
  store.load(Person, { id: 3, name: "Scumbag André" });
  store.load(Person, { id: 4, name: "Scumbag Paul" });

  var updatedPerson = store.find(Person, 1);
  var deletedPerson = store.find(Person, 2);
  var anotherUpdatedPerson = store.find(Person, 3);
  var invalidPerson = store.find(Person, 4);

  transaction = store.transaction();
  transaction.add(updatedPerson);
  transaction.add(deletedPerson);
  transaction.add(anotherUpdatedPerson);
  transaction.add(invalidPerson);

  var newPerson = transaction.createRecord(Person, {
    name: "Scumbag Yehuda"
  });
  var anotherInvalidPerson = transaction.createRecord(Person, {});

  updatedPerson.set('name', "Scumbag Patrick");
  anotherUpdatedPerson.set('name', "Scumbag Leah");
  deletedPerson.deleteRecord();
  invalidPerson.set('name', null);
  invalidPerson.send('willCommit');
  store.recordWasInvalid(invalidPerson, {name: 'no name!'});
  anotherInvalidPerson.send('willCommit');
  store.recordWasInvalid(anotherInvalidPerson, {name: 'no name!'});

  equal(updatedPerson.get('isDirty'), true, "precond - Record is marked as dirty when changed");
  equal(updatedPerson.get('name'), "Scumbag Patrick", "precond - Record has been changed to the value we set");
  equal(anotherUpdatedPerson.get('isDirty'), true, "precond - Record is marked as dirty when changed");
  equal(anotherUpdatedPerson.get('name'), "Scumbag Leah", "precond - Record has been changed to the value we set");
  equal(newPerson.get('isDirty'), true, "precond - new record is marked as dirty");
  equal(newPerson.get('isNew'), true, "precond - new record is marked as new");
  equal(deletedPerson.get('isDirty'), true, "precond - deleted record is marked as dirty when deleted");
  equal(deletedPerson.get('isDeleted'), true, "precond - deleted record is marked as deleted");
  equal(invalidPerson.get('isDirty'), true, "precond - invalid record is marked as dirty");
  equal(invalidPerson.get('isValid'), false, "precond - invalid record is marked as invalid");
  equal(anotherInvalidPerson.get('isDirty'), true, "precond - invalid record is marked as dirty");
  equal(anotherInvalidPerson.get('isNew'), true, "precond - invalid record is marked as dirty");
  equal(anotherInvalidPerson.get('isValid'), false, "precond - invalid record is marked as invalid");

  transaction.rollback();

  equal(updatedPerson.get('isDirty'), false, "Record is not dirty after rollback");
  equal(updatedPerson.get('name'), "Scumbag Tom", "Record has previously loaded name");
  equal(anotherUpdatedPerson.get('isDirty'), false, "Record is not dirty after rollback");
  equal(anotherUpdatedPerson.get('name'), "Scumbag André", "Record has previously loaded name");
  equal(newPerson.get('isDirty'), false, "created record is no longer considered dirty");
  equal(newPerson.get('isDeleted'), true, "created records are deleted when their transaction is rolled back");
  equal(deletedPerson.get('isDirty'), false, "deleted record is no longer considered dirty");
  equal(deletedPerson.get('isDeleted'), false, "deleted record is no longer considered deleted");
  equal(invalidPerson.get('isDirty'), false, "invalid record is no longer considered dirty");
  equal(invalidPerson.get('name'), "Scumbag Paul", "Record has previously loaded name");
  equal(invalidPerson.get('isValid'), true, "invalid record is marked as valid");
  equal(anotherInvalidPerson.get('isValid'), true, "invalid record is marked as valid");
  equal(anotherInvalidPerson.get('isDeleted'), true, "created records are deleted when their transaction is rolled back");

  equal(get(newPerson, 'transaction'), get(store, 'defaultTransaction'), "record should have been moved back to the default transaction");
  equal(get(updatedPerson, 'transaction'), get(store, 'defaultTransaction'), "record should have been moved back to the default transaction");
  equal(get(anotherUpdatedPerson, 'transaction'), get(store, 'defaultTransaction'), "record should have been moved back to the default transaction");
  equal(get(deletedPerson, 'transaction'), get(store, 'defaultTransaction'), "record should have been moved back to the default transaction");
  equal(get(invalidPerson, 'transaction'), get(store, 'defaultTransaction'), "record should have been moved back to the default transaction");
});

test("modified records are reset when their transaction is rolled back", function() {
  var store = DS.Store.create();

  store.load(Person, { id: 1, name: "Scumbag Tom" });

  var person = store.find(Person, 1);

  transaction = store.transaction();
  transaction.add(person);

  person.set('name', 'toto');

  store.recordWasInvalid(person, {name: 'error'});

  equal(person.get('isValid'), false, "precond - invalid record is marked as invalid");

  transaction.rollback();

  equal(person.get('isValid'), true, "invalid record is now marked as valid");
});
